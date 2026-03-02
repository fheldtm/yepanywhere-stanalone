package com.yepanywhere;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * DeviceServer runs under app_process (shell user) and serves framed screenshot/control traffic.
 *
 * Protocol:
 * - Handshake (device -> sidecar): [width u16 LE][height u16 LE]
 * - Frame request (sidecar -> device): [0x01]
 * - Frame response (device -> sidecar): [0x02][len u32 LE][jpeg bytes]
 * - Control (sidecar -> device): [0x03][len u32 LE][json bytes]
 */
public final class DeviceServer {
    private static final int PORT = 27183;
    private static final byte TYPE_FRAME_REQUEST = 0x01;
    private static final byte TYPE_FRAME_RESPONSE = 0x02;
    private static final byte TYPE_CONTROL = 0x03;

    private static final int JPEG_QUALITY = 70;
    private static final int TAP_SLOP_PX = 24;
    private static final int MIN_SWIPE_DURATION_MS = 80;
    private static final int MAX_SWIPE_DURATION_MS = 1200;

    private DeviceServer() {}

    public static void main(String[] args) {
        log("starting on 127.0.0.1:" + PORT);

        while (true) {
            try (ServerSocket server = new ServerSocket(PORT, 1, InetAddress.getByName("127.0.0.1"))) {
                Socket client = server.accept();
                log("client connected: " + client.getRemoteSocketAddress());
                try {
                    handleClient(client);
                } finally {
                    safeClose(client);
                }
            } catch (Throwable t) {
                logError("server loop error", t);
                sleepQuiet(1000);
            }
        }
    }

    private static void handleClient(Socket client) throws IOException {
        client.setTcpNoDelay(true);
        TouchTracker touchTracker = new TouchTracker();

        try (DataInputStream in = new DataInputStream(new BufferedInputStream(client.getInputStream()));
             BufferedOutputStream out = new BufferedOutputStream(client.getOutputStream())) {

            Frame frame = captureFrame();
            writeHandshake(out, frame.width, frame.height);

            while (true) {
                int msgType = in.read();
                if (msgType < 0) {
                    return;
                }

                if (msgType == TYPE_FRAME_REQUEST) {
                    frame = captureFrame();
                    writeLengthPrefixed(out, TYPE_FRAME_RESPONSE, frame.jpeg);
                    continue;
                }

                if (msgType == TYPE_CONTROL) {
                    int len = readLengthLE(in);
                    if (len < 0 || len > (4 * 1024 * 1024)) {
                        throw new IOException("invalid control payload length: " + len);
                    }
                    byte[] payload = new byte[len];
                    in.readFully(payload);
                    handleControl(payload, frame.width, frame.height, touchTracker);
                    continue;
                }

                throw new IOException(String.format(Locale.US, "unknown message type: 0x%02x", msgType));
            }
        }
    }

    private static void writeHandshake(OutputStream out, int width, int height) throws IOException {
        ByteBuffer b = ByteBuffer.allocate(4).order(ByteOrder.LITTLE_ENDIAN);
        b.putShort((short) Math.max(0, Math.min(0xFFFF, width)));
        b.putShort((short) Math.max(0, Math.min(0xFFFF, height)));
        out.write(b.array());
        out.flush();
    }

    private static void writeLengthPrefixed(OutputStream out, byte type, byte[] payload) throws IOException {
        ByteBuffer header = ByteBuffer.allocate(5).order(ByteOrder.LITTLE_ENDIAN);
        header.put(type);
        header.putInt(payload.length);
        out.write(header.array());
        out.write(payload);
        out.flush();
    }

    private static int readLengthLE(DataInputStream in) throws IOException {
        byte[] lenBytes = new byte[4];
        in.readFully(lenBytes);
        return ByteBuffer.wrap(lenBytes).order(ByteOrder.LITTLE_ENDIAN).getInt();
    }

    private static void handleControl(byte[] payload, int width, int height, TouchTracker touchTracker) {
        String raw = new String(payload, StandardCharsets.UTF_8);
        try {
            JSONObject obj = new JSONObject(raw);
            String cmd = obj.optString("cmd", "");
            switch (cmd) {
                case "touch":
                    handleTouch(obj, width, height, touchTracker);
                    break;
                case "key":
                    handleKey(obj);
                    break;
                default:
                    log("unknown control cmd: " + cmd);
            }
        } catch (JSONException e) {
            logError("invalid control json", e);
        }
    }

    private static void handleTouch(JSONObject obj, int width, int height, TouchTracker touchTracker) {
        JSONArray touches = obj.optJSONArray("touches");
        if (touches == null || touches.length() == 0) {
            return;
        }

        JSONObject t = touches.optJSONObject(0);
        if (t == null) {
            return;
        }

        int touchId = t.optInt("id", 0);
        double pressure = t.optDouble("pressure", 0.0);
        double nx = t.optDouble("x", 0.0);
        double ny = t.optDouble("y", 0.0);
        long nowMs = System.currentTimeMillis();
        int x = clamp((int) Math.round(nx * width), 0, Math.max(0, width - 1));
        int y = clamp((int) Math.round(ny * height), 0, Math.max(0, height - 1));

        // Touch release packet: synthesize tap (short/stationary) or swipe.
        if (pressure <= 0.0) {
            TouchState state = touchTracker.activeTouches.remove(touchId);
            touchTracker.activeIds.remove(touchId);
            if (state == null) {
                return;
            }

            int endX = x;
            int endY = y;
            int dx = endX - state.startX;
            int dy = endY - state.startY;
            int distSq = (dx * dx) + (dy * dy);
            int slopSq = TAP_SLOP_PX * TAP_SLOP_PX;

            try {
                if (distSq <= slopSq) {
                    runCommand(new String[]{"input", "tap", String.valueOf(state.startX), String.valueOf(state.startY)});
                } else {
                    int durationMs = clamp((int) (nowMs - state.startTimeMs), MIN_SWIPE_DURATION_MS, MAX_SWIPE_DURATION_MS);
                    runCommand(new String[]{
                        "input",
                        "swipe",
                        String.valueOf(state.startX),
                        String.valueOf(state.startY),
                        String.valueOf(endX),
                        String.valueOf(endY),
                        String.valueOf(durationMs),
                    });
                }
            } catch (IOException e) {
                logError("touch command failed", e);
            }
            return;
        }

        TouchState existing = touchTracker.activeTouches.get(touchId);
        if (existing != null) {
            existing.lastX = x;
            existing.lastY = y;
            existing.lastTimeMs = nowMs;
            return;
        }

        // Track touch-down until release, where we classify tap vs swipe.
        touchTracker.activeIds.add(touchId);
        touchTracker.activeTouches.put(touchId, new TouchState(x, y, nowMs));
    }

    private static void handleKey(JSONObject obj) {
        String key = obj.optString("key", "");
        if (key.isEmpty()) {
            return;
        }

        String keyCode = mapKeyCode(key);
        try {
            runCommand(new String[]{"input", "keyevent", keyCode});
        } catch (IOException e) {
            logError("key command failed", e);
        }
    }

    private static String mapKeyCode(String key) {
        String normalized = key.trim().toLowerCase(Locale.US);
        switch (normalized) {
            case "back":
            case "goback":
                return "KEYCODE_BACK";
            case "home":
            case "gohome":
                return "KEYCODE_HOME";
            case "appswitch":
            case "app_switch":
            case "recents":
            case "overview":
                return "KEYCODE_APP_SWITCH";
            case "menu":
                return "KEYCODE_MENU";
            case "power":
                return "KEYCODE_POWER";
            case "volume_up":
                return "KEYCODE_VOLUME_UP";
            case "volume_down":
                return "KEYCODE_VOLUME_DOWN";
            case "enter":
                return "KEYCODE_ENTER";
            case "escape":
                return "KEYCODE_ESCAPE";
            case "tab":
                return "KEYCODE_TAB";
            case "space":
                return "KEYCODE_SPACE";
            case "left":
                return "KEYCODE_DPAD_LEFT";
            case "right":
                return "KEYCODE_DPAD_RIGHT";
            case "up":
                return "KEYCODE_DPAD_UP";
            case "down":
                return "KEYCODE_DPAD_DOWN";
            default:
                if (normalized.startsWith("keycode_")) {
                    return normalized.toUpperCase(Locale.US);
                }
                if (normalized.length() == 1) {
                    return ("KEYCODE_" + normalized).toUpperCase(Locale.US);
                }
                return "KEYCODE_" + normalized.toUpperCase(Locale.US);
        }
    }

    private static Frame captureFrame() throws IOException {
        byte[] png = runCommand(new String[]{"screencap", "-p"});

        Bitmap bitmap = BitmapFactory.decodeByteArray(png, 0, png.length);
        if (bitmap == null) {
            throw new IOException("failed to decode screencap PNG");
        }

        int width = bitmap.getWidth();
        int height = bitmap.getHeight();

        ByteArrayOutputStream jpegOut = new ByteArrayOutputStream();
        if (!bitmap.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, jpegOut)) {
            throw new IOException("failed to encode JPEG");
        }
        bitmap.recycle();

        return new Frame(jpegOut.toByteArray(), width, height);
    }

    private static byte[] runCommand(String[] cmd) throws IOException {
        Process process = null;
        try {
            List<String> args = new ArrayList<>();
            for (String s : cmd) {
                args.add(s);
            }
            process = new ProcessBuilder(args).redirectErrorStream(true).start();
            byte[] output = readAll(process.getInputStream());
            int code = process.waitFor();
            if (code != 0) {
                throw new IOException("command failed (" + code + "): " + String.join(" ", cmd));
            }
            return output;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("command interrupted: " + String.join(" ", cmd), e);
        } finally {
            if (process != null) {
                safeClose(process.getInputStream());
                safeClose(process.getOutputStream());
                safeClose(process.getErrorStream());
                process.destroy();
            }
        }
    }

    private static byte[] readAll(InputStream in) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        while (true) {
            int n = in.read(buf);
            if (n < 0) {
                return out.toByteArray();
            }
            out.write(buf, 0, n);
        }
    }

    private static int clamp(int value, int min, int max) {
        if (value < min) {
            return min;
        }
        if (value > max) {
            return max;
        }
        return value;
    }

    private static void safeClose(AutoCloseable c) {
        if (c == null) {
            return;
        }
        try {
            c.close();
        } catch (Exception ignored) {
        }
    }

    private static void sleepQuiet(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException ignored) {
            Thread.currentThread().interrupt();
        }
    }

    private static void log(String msg) {
        System.err.println("[DeviceServer] " + msg);
    }

    private static void logError(String msg, Throwable t) {
        System.err.println("[DeviceServer] " + msg + ": " + t);
    }

    private static final class Frame {
        final byte[] jpeg;
        final int width;
        final int height;

        Frame(byte[] jpeg, int width, int height) {
            this.jpeg = jpeg;
            this.width = width;
            this.height = height;
        }
    }

    private static final class TouchTracker {
        final Set<Integer> activeIds = new HashSet<>();
        final Map<Integer, TouchState> activeTouches = new HashMap<>();
    }

    private static final class TouchState {
        final int startX;
        final int startY;
        final long startTimeMs;
        int lastX;
        int lastY;
        long lastTimeMs;

        TouchState(int startX, int startY, long startTimeMs) {
            this.startX = startX;
            this.startY = startY;
            this.startTimeMs = startTimeMs;
            this.lastX = startX;
            this.lastY = startY;
            this.lastTimeMs = startTimeMs;
        }
    }
}
