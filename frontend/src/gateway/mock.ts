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
 * pages.
 *
 * Every instance owns its state via closure copies — tests mount <App /> with
 * a fresh gateway and never see each other's mutations. App keeps a single
 * instance so dev mode retains state across page switches.
 */

const CORE_VERSION = "1.19.4";
const APP_VERSION = "v3.0.0";
const UPTIME_SECONDS = 4 * 3600 + 12 * 60;

export function createMockGateway(): Gateway {
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
    autoUpdateEnabled: true,
    autoUpdateIntervalHours: 12,
    autoSwitchLowestLatency: true,
    proxyDownload: false,
    chainedProxy: false,
    coreAutoUpdate: false,
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
      updatedUnix: Math.floor(Date.now() / 1000) - 3 * 3600,
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
      updatedUnix: Math.floor(Date.now() / 1000) - 26 * 3600,
      current: false,
    },
  ];

  const trafficClock: TrafficSample[] = [];
  const logBuffer: LogLine[] = [];
  const trafficHandlers = new Set<StreamHandler>();
  const logHandlers = new Set<StreamHandler>();
  const profilesHandlers = new Set<() => void>();

  function notifyProfiles() {
    profilesHandlers.forEach((handler) => handler());
  }
  let trafficTimer: ReturnType<typeof setInterval> | undefined;
  let logTimer: ReturnType<typeof setInterval> | undefined;

  // Seed the console with the lines a live kernel would already have buffered,
  // so the log page opens with history instead of an empty frame.
  const seed: Array<[LogLine["level"], string]> = [
    ["info", "混合端口监听 127.0.0.1:7890 · 允许局域网 false"],
    ["debug", "[TUN] inbound connection from 10.0.0.5:7890 · uid 501"],
    ["info", "配置「机场 A · 主订阅」已更新，126 个节点载入完成 · 耗时 1.8s"],
    ["error", "节点「英国 · 伦敦 01」连接超时（3000ms），已自动切换到备用节点"],
    ["info", "[UDP] 192.168.1.12:5353 · 8.8.8.8:53 · GeoIP(CN) · 命中 DIRECT"],
    ["warn", "节点「美国 · 洛杉矶 02」延迟 210ms，超过阈值 150ms，已标记为待切换"],
    ["debug", "[DNS] query A fonts.googleapis.com · 142.250.72.14 · 命中缓存"],
    [
      "info",
      "[TCP] 192.168.1.12:52140 · api.github.com:443 · DomainSuffix(github.com) · 命中 节点选择[日本 东京 01]",
    ],
    [
      "info",
      "[TCP] 192.168.1.12:52144 · www.youtube.com:443 · DomainSuffix(youtube.com) · 命中 节点选择[香港 IPLC 02]",
    ],
    [
      "info",
      "[TCP] 192.168.1.12:52138 · steamcommunity.com:443 · DomainKeyword(steam) · 命中 节点选择[香港 IPLC 02]",
    ],
  ];
  seed.forEach(([level, message], index) => {
    const at = new Date(Date.now() - (seed.length - index) * 1000);
    logBuffer.push({ time: clock(at), level, message });
  });

  // What a live kernel keeps printing while the console is open.
  const feed: Array<[LogLine["level"], string]> = [
    [
      "info",
      "[TCP] 10.0.0.5:51204 · api.github.com:443 · DomainSuffix(github.com) · 命中 节点选择[香港 IPLC 02]",
    ],
    ["debug", "[DNS] query A cdn.jsdelivr.net · 151.101.1.229 · 命中缓存"],
    [
      "info",
      "[TCP] 10.0.0.5:51208 · www.youtube.com:443 · DomainSuffix(youtube.com) · 命中 节点选择[香港 IPLC 02]",
    ],
    ["info", "[UDP] 192.168.1.12:5353 · 8.8.8.8:53 · GeoIP(CN) · 命中 DIRECT"],
    ["warn", "节点「新加坡 · SG 03」延迟 118ms，高于组内最优 38ms"],
    [
      "info",
      "[TCP] 10.0.0.5:51212 · steamcommunity.com:443 · DomainKeyword(steam) · 命中 节点选择[日本 东京 01]",
    ],
    ["debug", "[TUN] inbound connection from 10.0.0.5:51216 · uid 501"],
  ];

  function pushLog(line: LogLine) {
    logBuffer.push(line);
    if (logBuffer.length > 512) logBuffer.shift();
    logHandlers.forEach((handler) => handler(line));
  }

  function ensureLogClock() {
    if (logTimer) return;
    let cursor = 0;
    logTimer = setInterval(() => {
      const [level, message] = feed[cursor % feed.length];
      cursor += 1;
      pushLog({ time: clock(), level, message });
      if (logHandlers.size === 0) {
        clearInterval(logTimer);
        logTimer = undefined;
      }
    }, 2000);
  }

  function ensureTrafficClock() {
    if (trafficTimer) return;
    trafficTimer = setInterval(() => {
      // Boards show 88.2 MB/s with decimal units; keep the mock in decimal
      // bytes so the displays match the design without conversion.
      const sample: TrafficSample = {
        down: 88.2 * 1e6,
        up: 12.4 * 1e6,
        connections: 42,
      };
      trafficClock.push(sample);
      if (trafficClock.length > 60) trafficClock.shift();
      trafficHandlers.forEach((handler) => handler(sample));
      if (trafficHandlers.size === 0) {
        clearInterval(trafficTimer);
        trafficTimer = undefined;
      }
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
      if (!group) return;
      group.selected = nodeName;
      // The main select group is the exit; keep the status card in sync so the
      // hero and the current-exit card follow the pick immediately.
      const node = group.nodes.find((candidate) => candidate.name === nodeName);
      if (groupId === "proxy" && node) {
        status.exitNode = node.name;
        status.exitLatency = node.latency;
      }
    },

    async testGroup(groupId) {
      await sleep(600);
      const group = groups.find((candidate) => candidate.id === groupId);
      group?.nodes.forEach((node) => {
        if (node.latency !== null) node.latency = Math.max(20, node.latency - 3);
      });
      pushLog({ time: clock(), level: "info", message: `测速完成 · 策略组 ${groupId}` });
    },

    async testAllGroups() {
      await sleep(700);
      groups.forEach((group) => {
        group.nodes.forEach((node) => {
          if (node.latency !== null) node.latency = Math.max(20, node.latency - 3);
        });
      });
      pushLog({ time: clock(), level: "info", message: "全部策略组测速完成" });
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

    async restartCore() {
      pushLog({ time: clock(), level: "info", message: "内核已重启，代理信息重新载入" });
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
      pushLog({ time: clock(), level: "info", message: "规则集已更新，1284 条规则载入完成" });
    },

    async clearLogs() {
      logBuffer.length = 0;
    },

    async openLogDirectory() {
      pushLog({ time: clock(), level: "info", message: "已打开日志目录 ~/Library/Logs/GoClash" });
    },

    async openConfigDirectory() {
      pushLog({
        time: clock(),
        level: "info",
        message: "已打开配置目录 ~/Library/Application Support/GoClash",
      });
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
        updatedUnix: Math.floor(Date.now() / 1000),
        current: false,
      });
      notifyProfiles();
    },

    async removeProfile(id) {
      const index = profiles.findIndex((candidate) => candidate.id === id);
      if (index >= 0) profiles.splice(index, 1);
      notifyProfiles();
    },

    async refreshProfile(id) {
      const profile = profiles.find((candidate) => candidate.id === id);
      if (profile) {
        profile.updatedAt = "刚刚";
        profile.updatedUnix = Math.floor(Date.now() / 1000);
      }
      notifyProfiles();
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

    onProfilesChanged(handler) {
      profilesHandlers.add(handler);
      return () => profilesHandlers.delete(handler);
    },

    subscribe(stream, onEvent) {
      if (stream === "traffic") {
        trafficHandlers.add(onEvent);
        ensureTrafficClock();
        return () => trafficHandlers.delete(onEvent);
      }
      // Logs replay the kernel's current buffer on attach, then stream live —
      // the console opens with history, exactly like `docker logs`.
      logHandlers.add(onEvent);
      logBuffer.forEach((line) => onEvent(line));
      ensureLogClock();
      return () => logHandlers.delete(onEvent);
    },
  };
}

/** Mock clock for log lines; the real kernel prints the same wall-clock stamps. */
function clock(date = new Date()): string {
  const pad = (value: number, length = 2) => String(value).padStart(length, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const MOCK_META = { appVersion: APP_VERSION, coreVersion: CORE_VERSION };
