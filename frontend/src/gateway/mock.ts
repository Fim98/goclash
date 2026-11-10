import type {
  Connection,
  Gateway,
  LogLine,
  Profile,
  ProxyGroup,
  Rule,
  Settings,
  Status,
  StreamHandler,
  TrafficSample,
} from "./types";

/**
 * In-memory gateway. v1 feeds the UI with the exact shapes the design boards
 * show; swapping to the real kernel later means replacing this file, not the
 * pages. Mutations live in local state so the UI can round-trip (settings,
 * node selection, closed connections…).
 */

const CORE_VERSION = "1.19.4";
const APP_VERSION = "v3.0.0";
const UPTIME_SECONDS = 4 * 3600 + 12 * 60;

const status: Status = {
  connected: true,
  mode: "rule",
  systemProxy: true,
  tun: false,
  mixedPort: 7890,
  coreVersion: CORE_VERSION,
  uptimeSeconds: UPTIME_SECONDS,
  exitNode: "香港 · IPLC 02",
  exitLatency: 38,
  exitIp: "203.0.113.42",
  exitAsn: "HK · HKG · AS4760 CLOUDFLARE",
  exitRegion: "香港",
  nativeIp: true,
};

const settings: Settings = {
  systemProxy: true,
  tun: false,
  mixedPort: 7890,
  allowLan: false,
  mode: "rule",
  logLevel: "info",
  autoUpdateIntervalHours: 12,
  autoSwitchLowestLatency: true,
  proxyDownload: false,
  launchAtLogin: true,
  silentStart: false,
  closeAction: "tray",
  channel: "stable",
  language: "简体中文",
  theme: "light",
  accent: "coral",
  menuBarLatency: true,
};

const groups: ProxyGroup[] = [
  {
    id: "proxy",
    name: "节点选择",
    strategy: "select",
    selected: "香港 · IPLC 02",
    nodes: [
      { name: "香港 · IPLC 02", latency: 38 },
      { name: "日本 · 东京 01", latency: 52 },
      { name: "新加坡 · SG 03", latency: 118 },
      { name: "台湾 · 台北 01", latency: 26 },
      { name: "美国 · 洛杉矶 02", latency: 210 },
      { name: "韩国 · 首尔 01", latency: 64 },
    ],
  },
  {
    id: "auto",
    name: "自动选择",
    strategy: "fallback",
    nodes: [
      { name: "香港 · IPLC 01", latency: 42 },
      { name: "日本 · 东京 02", latency: 58 },
      { name: "台湾 · 台北 02", latency: 31 },
      { name: "新加坡 · SG 01", latency: 121 },
      { name: "美国 · 洛杉矶 01", latency: 198 },
      { name: "英国 · 伦敦 01", latency: 156 },
    ],
  },
];

const connections: Connection[] = [
  {
    id: "c1",
    host: "www.youtube.com:443",
    rule: "DOMAIN-SUFFIX,youtube.com",
    exit: "香港 · IPLC 02",
    uploadBytes: 1_200_000,
    downloadBytes: 8_400_000,
    durationSeconds: 134,
    kind: "proxy",
  },
  {
    id: "c2",
    host: "api.github.com:443",
    rule: "DOMAIN-SUFFIX,github.com",
    exit: "日本 · 东京 01",
    uploadBytes: 400_000,
    downloadBytes: 1_800_000,
    durationSeconds: 52,
    kind: "proxy",
  },
  {
    id: "c3",
    host: "192.168.1.12:5353",
    rule: "GEOIP,CN",
    exit: "DIRECT",
    uploadBytes: 0,
    downloadBytes: 200_000,
    durationSeconds: 723,
    kind: "direct",
  },
  {
    id: "c4",
    host: "cdn.jsdelivr.net:443",
    rule: "RULE-SET,cdn",
    exit: "新加坡 · SG 03",
    uploadBytes: 800_000,
    downloadBytes: 5_100_000,
    durationSeconds: 91,
    kind: "proxy",
  },
  {
    id: "c5",
    host: "steamcommunity.com:443",
    rule: "DOMAIN-KEYWORD,steam",
    exit: "香港 · IPLC 02",
    uploadBytes: 200_000,
    downloadBytes: 2_600_000,
    durationSeconds: 227,
    kind: "proxy",
  },
  {
    id: "c6",
    host: "tracker.example.net:8080",
    rule: "RULE-SET,tracker",
    exit: "REJECT",
    uploadBytes: 0,
    downloadBytes: 0,
    durationSeconds: 1,
    kind: "reject",
  },
  {
    id: "c7",
    host: "fonts.googleapis.com:443",
    rule: "DOMAIN-SUFFIX,googleapis.com",
    exit: "台湾 · 台北 01",
    uploadBytes: 100_000,
    downloadBytes: 600_000,
    durationSeconds: 18,
    kind: "proxy",
  },
  {
    id: "c8",
    host: "10.0.0.5:7890",
    rule: "IP-CIDR,10.0.0.0/8",
    exit: "DIRECT",
    uploadBytes: 0,
    downloadBytes: 100_000,
    durationSeconds: 502,
    kind: "direct",
  },
  {
    id: "c9",
    host: "openai.com:443",
    rule: "DOMAIN-SUFFIX,openai.com",
    exit: "美国 · 洛杉矶 02",
    uploadBytes: 900_000,
    downloadBytes: 4_300_000,
    durationSeconds: 44,
    kind: "proxy",
  },
];

const rules: Rule[] = [
  { type: "DOMAIN-SUFFIX", payload: "google.com", policy: "节点选择", hits: 1284 },
  { type: "DOMAIN-SUFFIX", payload: "github.com", policy: "节点选择", hits: 862 },
  { type: "DOMAIN-KEYWORD", payload: "youtube", policy: "节点选择", hits: 2431 },
  { type: "IP-CIDR", payload: "10.0.0.0/8", policy: "DIRECT", hits: 41 },
  { type: "GEOIP", payload: "CN", policy: "DIRECT", hits: 9802 },
  { type: "RULE-SET", payload: "reject-ads", policy: "REJECT", hits: 312 },
  { type: "RULE-SET", payload: "proxy-gfw", policy: "节点选择", hits: 5140 },
  { type: "DOMAIN-SUFFIX", payload: "cn", policy: "DIRECT", hits: 2076 },
  { type: "MATCH", payload: "兜底 · 未命中任何规则", policy: "节点选择", hits: 640 },
];

const profiles: Profile[] = [
  {
    id: "p1",
    name: "机场 A · 主订阅",
    url: "https://sub.example.com/api/v1/client/subscribe?token=8f2a…",
    usedBytes: 128 * 1024 ** 3,
    totalBytes: 200 * 1024 ** 3,
    nodeCount: 126,
    expiresAt: "2027-01-12",
    updatedAt: "3 小时前",
    current: true,
  },
  {
    id: "p2",
    name: "机场 B · 备份",
    url: "https://backup.example.net/sub?token=4c1d…",
    usedBytes: 12 * 1024 ** 3,
    totalBytes: 50 * 1024 ** 3,
    nodeCount: 34,
    expiresAt: "2026-12-01",
    updatedAt: "昨天",
    current: false,
  },
];

const trafficClock: TrafficSample[] = [];

export function createMockGateway(): Gateway {
  const logBuffer: LogLine[] = [];
  const trafficHandlers = new Set<StreamHandler>();
  const logHandlers = new Set<StreamHandler>();
  let trafficTimer: ReturnType<typeof setInterval> | undefined;

  function pushLog(line: LogLine) {
    logBuffer.push(line);
    if (logBuffer.length > 512) logBuffer.shift();
    logHandlers.forEach((handler) => handler(line));
  }

  function ensureTrafficClock() {
    if (trafficTimer) return;
    trafficTimer = setInterval(() => {
      const sample: TrafficSample = {
        down: 88.2 * 1024 * 1024,
        up: 12.4 * 1024 * 1024,
        connections: 42,
      };
      trafficClock.push(sample);
      if (trafficClock.length > 60) trafficClock.shift();
      trafficHandlers.forEach((handler) => handler(sample));
    }, 1000);
  }

  return {
    async status() {
      return { ...status, systemProxy: settings.systemProxy, mode: settings.mode };
    },

    async groups() {
      return groups.map((group) => ({
        ...group,
        nodes: group.nodes.map((node) => ({ ...node })),
        selected: group.selected,
      }));
    },

    async select(groupId, nodeName) {
      const group = groups.find((candidate) => candidate.id === groupId);
      if (group) group.selected = nodeName;
    },

    async testGroup(groupId) {
      pushLog({ time: now(), level: "info", message: `测速完成 · 策略组 ${groupId}` });
    },

    async testAllGroups() {
      pushLog({ time: now(), level: "info", message: "全部策略组测速完成" });
    },

    async setMode(mode) {
      settings.mode = mode;
      status.mode = mode;
    },

    async setSystemProxy(on) {
      settings.systemProxy = on;
      status.systemProxy = on;
      status.connected = on;
    },

    async connections() {
      return connections.map((connection) => ({ ...connection }));
    },

    async closeConnection(id) {
      const index = connections.findIndex((candidate) => candidate.id === id);
      if (index >= 0) connections.splice(index, 1);
    },

    async closeAllConnections() {
      connections.length = 0;
    },

    async rules() {
      return rules.map((rule) => ({ ...rule }));
    },

    async reloadRules() {
      pushLog({ time: now(), level: "info", message: "规则集已更新，1284 条规则载入完成" });
    },

    async profiles() {
      return profiles.map((profile) => ({ ...profile }));
    },

    async addProfile(url) {
      profiles.push({
        id: `p${profiles.length + 1}`,
        name: `新订阅 ${profiles.length + 1}`,
        url,
        usedBytes: 0,
        totalBytes: 0,
        nodeCount: 0,
        expiresAt: "未知",
        updatedAt: "刚刚",
        current: false,
      });
    },

    async removeProfile(id) {
      const index = profiles.findIndex((candidate) => candidate.id === id);
      if (index >= 0) profiles.splice(index, 1);
    },

    async refreshProfile(id) {
      const profile = profiles.find((candidate) => candidate.id === id);
      if (profile) profile.updatedAt = "刚刚";
    },

    async settings() {
      return { ...settings };
    },

    async updateSettings(patch) {
      Object.assign(settings, patch);
      if (patch.systemProxy !== undefined) {
        status.systemProxy = patch.systemProxy;
        status.connected = patch.systemProxy;
      }
      if (patch.mode) status.mode = patch.mode;
    },

    subscribe(stream, onEvent) {
      if (stream === "traffic") {
        trafficHandlers.add(onEvent);
        ensureTrafficClock();
        return () => trafficHandlers.delete(onEvent);
      }
      logHandlers.add(onEvent);
      return () => logHandlers.delete(onEvent);
    },
  };
}

/** Mock clock for log lines; the real gateway prints the kernel's stamps. */
function now(): string {
  const date = new Date();
  const pad = (value: number, length = 2) => String(value).padStart(length, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export const MOCK_META = { appVersion: APP_VERSION, coreVersion: CORE_VERSION };
