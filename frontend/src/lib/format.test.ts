import { describe, expect, it } from "vitest";

import {
  formatBytes,
  formatDuration,
  formatLatency,
  formatSpeed,
  formatTraffic,
  formatUptime,
  latencyTone,
} from "./format";

describe("formatBytes (binary, storage)", () => {
  it("formats gigabytes without trailing zeros", () => {
    expect(formatBytes(128 * 1024 ** 3)).toBe("128 GB");
    expect(formatBytes(12 * 1024 ** 3, 1)).toBe("12 GB");
    expect(formatBytes(500 * 1024 ** 2, 1)).toBe("500 MB");
  });
});

describe("formatSpeed (decimal, wire)", () => {
  it("formats megabytes per second", () => {
    expect(formatSpeed(88.2e6)).toBe("88.2 MB/s");
    expect(formatSpeed(12.4e6)).toBe("12.4 MB/s");
    expect(formatSpeed(900)).toBe("900 B/s");
  });
});

describe("formatTraffic", () => {
  it("formats single connection counters", () => {
    expect(formatTraffic(1_200_000)).toBe("1.2 MB");
    expect(formatTraffic(8_400_000)).toBe("8.4 MB");
    expect(formatTraffic(0)).toBe("0 B");
  });
});

describe("formatDuration", () => {
  it("pads minutes and seconds", () => {
    expect(formatDuration(134)).toBe("02:14");
    expect(formatDuration(7)).toBe("00:07");
    expect(formatDuration(3734)).toBe("1:02:14");
  });
});

describe("formatUptime", () => {
  it("uses the sidebar format", () => {
    expect(formatUptime(4 * 3600 + 12 * 60)).toBe("4h 12m");
    expect(formatUptime(12 * 60)).toBe("12m");
    expect(formatUptime(45)).toBe("45s");
  });
});

describe("latencyTone", () => {
  it("buckets delays into the design colours", () => {
    expect(latencyTone(26)).toBe("mint");
    expect(latencyTone(59)).toBe("mint");
    expect(latencyTone(60)).toBe("sunny");
    expect(latencyTone(150)).toBe("sunny");
    expect(latencyTone(151)).toBe("peach");
    expect(latencyTone(null)).toBe("none");
  });

  it("formats untested nodes as a dash", () => {
    expect(formatLatency(38)).toBe("38 ms");
    expect(formatLatency(null)).toBe("—");
  });
});
