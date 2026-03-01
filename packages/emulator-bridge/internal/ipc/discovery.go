package ipc

import (
	"fmt"
	"net"
	"os/exec"
	"strings"
)

// EmulatorInfo describes a discovered Android emulator.
type EmulatorInfo struct {
	ID    string `json:"id"`    // e.g., "emulator-5554"
	AVD   string `json:"avd"`   // e.g., "Pixel_7"
	State string `json:"state"` // "running" or "stopped"
}

// Discovery handles ADB-based emulator detection.
type Discovery struct {
	adbPath string
}

// NewDiscovery creates a discovery instance with the given adb binary path.
func NewDiscovery(adbPath string) *Discovery {
	return &Discovery{adbPath: adbPath}
}

// ListEmulators returns all known emulators (running + stopped AVDs).
func (d *Discovery) ListEmulators() ([]EmulatorInfo, error) {
	running, err := d.listRunning()
	if err != nil {
		return nil, fmt.Errorf("listing running emulators: %w", err)
	}

	avds, err := d.listAVDs()
	if err != nil {
		// AVD listing is optional (emulator binary might not be on PATH)
		avds = nil
	}

	// Build a set of AVD names that are running.
	runningAVDs := make(map[string]bool)
	for _, e := range running {
		runningAVDs[e.AVD] = true
	}

	// Start with running emulators.
	result := make([]EmulatorInfo, 0, len(running)+len(avds))
	result = append(result, running...)

	// Add stopped AVDs that aren't currently running.
	for _, avd := range avds {
		if !runningAVDs[avd] {
			result = append(result, EmulatorInfo{
				ID:    "avd-" + avd,
				AVD:   avd,
				State: "stopped",
			})
		}
	}

	return result, nil
}

// GRPCAddr returns the gRPC address for a running emulator.
// The emulator gRPC port is the console port + 3000 (convention).
// e.g., emulator-5554 → console port 5554 → gRPC port 8554.
func GRPCAddr(emulatorID string) string {
	// Extract port from ID like "emulator-5554"
	parts := strings.SplitN(emulatorID, "-", 2)
	if len(parts) != 2 {
		return "localhost:8554" // fallback
	}
	port := parts[1]
	// gRPC port = console port + 3000
	var consolePort int
	if _, err := fmt.Sscanf(port, "%d", &consolePort); err != nil {
		return "localhost:8554"
	}
	return fmt.Sprintf("localhost:%d", consolePort+3000)
}

// listRunning queries `adb devices` for running emulator instances.
func (d *Discovery) listRunning() ([]EmulatorInfo, error) {
	out, err := exec.Command(d.adbPath, "devices").Output()
	if err != nil {
		return nil, fmt.Errorf("running adb devices: %w", err)
	}

	var emulators []EmulatorInfo
	for _, line := range strings.Split(string(out), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "List of") || strings.HasPrefix(line, "*") {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}
		serial := fields[0]
		status := fields[1]

		// Only include emulators (serial starts with "emulator-")
		if !strings.HasPrefix(serial, "emulator-") {
			continue
		}
		if status != "device" {
			continue
		}

		avdName := d.getAVDName(serial)
		emulators = append(emulators, EmulatorInfo{
			ID:    serial,
			AVD:   avdName,
			State: "running",
		})
	}

	return emulators, nil
}

// listAVDs queries `emulator -list-avds` for available AVD profiles.
func (d *Discovery) listAVDs() ([]string, error) {
	// The emulator binary is typically alongside adb in the SDK.
	// Try "emulator" on PATH first.
	out, err := exec.Command("emulator", "-list-avds").Output()
	if err != nil {
		return nil, fmt.Errorf("running emulator -list-avds: %w", err)
	}

	var avds []string
	for _, line := range strings.Split(string(out), "\n") {
		line = strings.TrimSpace(line)
		if line != "" {
			avds = append(avds, line)
		}
	}
	return avds, nil
}

// getAVDName queries the AVD name for a running emulator serial.
func (d *Discovery) getAVDName(serial string) string {
	// Connect to the emulator's console port to query the AVD name.
	// Serial is like "emulator-5554", console port is 5554.
	parts := strings.SplitN(serial, "-", 2)
	if len(parts) != 2 {
		return serial
	}
	port := parts[1]

	conn, err := net.DialTimeout("tcp", "localhost:"+port, 2e9) // 2 second timeout
	if err != nil {
		return serial
	}
	defer conn.Close()

	// Read the greeting.
	buf := make([]byte, 1024)
	conn.Read(buf)

	// Send "avd name" command.
	fmt.Fprintf(conn, "avd name\n")

	n, err := conn.Read(buf)
	if err != nil || n == 0 {
		return serial
	}

	// Parse response: first line is the AVD name.
	response := string(buf[:n])
	lines := strings.Split(strings.TrimSpace(response), "\n")
	if len(lines) > 0 {
		name := strings.TrimSpace(lines[0])
		if name != "" && name != "OK" {
			return name
		}
	}

	return serial
}
