/**
 * Pure formatting helpers. Numbers follow the design boards: network traffic is
 * decimal (1 MB = 1e6 bytes, like an ISP), storage quota is binary (1 GB =
 * 1024³, like macOS). Mixing them up is how you end up promising 200 GB and
 * delivering 186.
 */

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"];

function trim(value: number, digits: number): string {
  const fixed = value.toFixed(digits);
  return fixed.replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
}

function scale(bytes: number, base: number): { value: number; unit: string } {
  let value = bytes;
  let unit = 0;
  while (Math.abs(value) >= base && unit < BYTE_UNITS.length - 1) {
    value /= base;
    unit += 1;
  }
  return { value, unit: BYTE_UNITS[unit] };
}

/** Storage-style bytes: binary units (1 GB = 1024³). */
export function formatBytes(bytes: number, digits = 0): string {
  const { value, unit } = scale(bytes, 1024);
  return `${trim(value, digits)} ${unit}`;
}

/** Wire-speed bytes: decimal units (1 MB = 1e6). */
export function formatSpeed(bytesPerSecond: number, digits = 1): string {
  const { value, unit } = scale(bytesPerSecond, 1000);
  return `${trim(value, digits)} ${unit}/s`;
}

/** Wire speed with fixed decimals — stat cards keep one decimal while streaming. */
export function formatSpeedFixed(bytesPerSecond: number, digits = 1): string {
  const { value, unit } = scale(bytesPerSecond, 1000);
  return `${value.toFixed(digits)} ${unit}/s`;
}

/** A single traffic cell: "1.2 MB". */
export function formatTraffic(bytes: number): string {
  const { value, unit } = scale(bytes, 1000);
  return `${trim(value, 1)} ${unit}`;
}

/** Clock-style elapsed time: 02:14, or 1:02:14 past an hour. */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** Kernel uptime: 4h 12m, 12m, 45s — the sidebar card format. */
export function formatUptime(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

export type LatencyTone = "mint" | "sunny" | "peach" | "none";

/** <60 mint, 60–150 sunny, >150 peach, untested = none. */
export function latencyTone(latency: number | null): LatencyTone {
  if (latency === null || latency <= 0) return "none";
  if (latency < 60) return "mint";
  if (latency <= 150) return "sunny";
  return "peach";
}

export function formatLatency(latency: number | null): string {
  return latency === null || latency <= 0 ? "—" : `${latency} ms`;
}
