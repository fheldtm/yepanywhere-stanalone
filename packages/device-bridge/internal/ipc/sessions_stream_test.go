package ipc

import (
	"context"
	"errors"
	"testing"

	"github.com/anthropics/yepanywhere/device-bridge/internal/device"
)

type streamTestDevice struct {
	startErr   error
	startCalls int
	startOpts  device.StreamOptions
	source     *device.NalSource
}

func (d *streamTestDevice) GetFrame(context.Context, int) (*device.Frame, error) { return nil, nil }
func (d *streamTestDevice) SendTouch(context.Context, []device.TouchPoint) error { return nil }
func (d *streamTestDevice) SendKey(context.Context, string) error                { return nil }
func (d *streamTestDevice) ScreenSize() (int32, int32)                           { return 1080, 2400 }
func (d *streamTestDevice) Close() error                                         { return nil }

func (d *streamTestDevice) StartStream(_ context.Context, opts device.StreamOptions) (*device.NalSource, error) {
	d.startCalls++
	d.startOpts = opts
	if d.startErr != nil {
		return nil, d.startErr
	}
	if d.source == nil {
		d.source = device.NewNalSource()
	}
	return d.source, nil
}

func (d *streamTestDevice) StopStream(context.Context) error            { return nil }
func (d *streamTestDevice) SetStreamBitrate(context.Context, int) error { return nil }
func (d *streamTestDevice) RequestStreamKeyframe(context.Context) error { return nil }

type nonStreamTestDevice struct{}

func (d *nonStreamTestDevice) GetFrame(context.Context, int) (*device.Frame, error) { return nil, nil }
func (d *nonStreamTestDevice) SendTouch(context.Context, []device.TouchPoint) error { return nil }
func (d *nonStreamTestDevice) SendKey(context.Context, string) error                { return nil }
func (d *nonStreamTestDevice) ScreenSize() (int32, int32)                           { return 1080, 2400 }
func (d *nonStreamTestDevice) Close() error                                         { return nil }

func TestMaybeStartAndroidStreamStartsWhenSupported(t *testing.T) {
	dev := &streamTestDevice{source: device.NewNalSource()}

	nalSource, streamCap, err := maybeStartAndroidStream(dev, "android", 1280, 720, 30)
	if err != nil {
		t.Fatalf("maybeStartAndroidStream returned error: %v", err)
	}
	if nalSource == nil {
		t.Fatal("expected NAL source when stream is supported")
	}
	if streamCap == nil {
		t.Fatal("expected StreamCapable handle")
	}
	if dev.startCalls != 1 {
		t.Fatalf("expected StartStream to be called once, got %d", dev.startCalls)
	}
	if dev.startOpts.Width != 1280 || dev.startOpts.Height != 720 || dev.startOpts.FPS != 30 {
		t.Fatalf("unexpected StartStream opts: %+v", dev.startOpts)
	}
	if dev.startOpts.BitrateBps != 2_000_000 {
		t.Fatalf("unexpected bitrate: got %d", dev.startOpts.BitrateBps)
	}
}

func TestMaybeStartAndroidStreamFallsBackWhenUnsupported(t *testing.T) {
	dev := &nonStreamTestDevice{}

	nalSource, streamCap, err := maybeStartAndroidStream(dev, "android", 720, 1280, 30)
	if err != nil {
		t.Fatalf("expected nil error for unsupported stream path, got %v", err)
	}
	if nalSource != nil || streamCap != nil {
		t.Fatalf("expected nil stream results for unsupported path: nal=%v streamCap=%v", nalSource, streamCap)
	}
}

func TestMaybeStartAndroidStreamReturnsErrorForFallback(t *testing.T) {
	dev := &streamTestDevice{startErr: errors.New("legacy server")}

	nalSource, streamCap, err := maybeStartAndroidStream(dev, "android", 720, 1280, 30)
	if err == nil {
		t.Fatal("expected start error")
	}
	if nalSource != nil || streamCap != nil {
		t.Fatalf("expected nil results on stream_start failure: nal=%v streamCap=%v", nalSource, streamCap)
	}
	if dev.startCalls != 1 {
		t.Fatalf("expected StartStream to be called once, got %d", dev.startCalls)
	}
}
