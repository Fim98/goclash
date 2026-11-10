/**
 * The one contract between the UI and the kernel.
 *
 * v1 runs against an in-memory mock; the real implementation will read the
 * mihomo REST/WS surface from the Go side and feed the same shapes. Pages must
 * never depend on anything beyond this file.
 *
 * Push streams (traffic / log) use subscribe + unsubscribe instead of polling
 * so the transport can move to Wails events without touching pages.
 */

export type ProxyMode = "rule" | "global" | "direct";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type GroupStrategy = "select" | "url-test" | "fallback" | "load-balance" | "relay";

/** Round-trip milliseconds from the last delay check; null = never tested. */
export type Latency = number | null;

export interface ProxyNode {
  name: string;
  latency: Latency;
}

export interface ProxyGroup {
  id: string;
  name: string;
  strategy: GroupStrategy;
  nodes: ProxyNode[];
  /** Currently selected node; only meaningful for `select` groups. */
  selected?: string;
}

export interface TrafficSample {
  /** Bytes per second. */
  down: number;
  up: number;
  /** Active connection count at sample time. */
  connections: number;
}

export interface LogLine {
  /** RFC-ish clock the kernel printed, e.g. "20:27:41.203". */
  time: string;
  level: LogLevel;
  message: string;
}

export interface Connection {
  id: string;
  host: string;
  rule: string;
  exit: string;
  uploadBytes: number;
  downloadBytes: number;
  durationSeconds: number;
  /** "proxy" | "direct" | "reject" — drives the filter chips. */
  kind: "proxy" | "direct" | "reject";
}

export interface Rule {
  type: string;
  payload: string;
  /** Policy name, e.g. 节点选择 / DIRECT / REJECT. */
  policy: string;
  hits: number;
}

export interface Profile {
  id: string;
  name: string;
  url: string;
  usedBytes: number;
  totalBytes: number;
  nodeCount: number;
  expiresAt: string;
  updatedAt: string;
  current: boolean;
}

export interface Status {
  connected: boolean;
  mode: ProxyMode;
  systemProxy: boolean;
  tun: boolean;
  mixedPort: number;
  coreVersion: string;
  uptimeSeconds: number;
  exitNode: string;
  exitLatency: Latency;
  exitIp: string;
  exitAsn: string;
  exitRegion: string;
  nativeIp: boolean;
}

export interface Settings {
  systemProxy: boolean;
  tun: boolean;
  mixedPort: number;
  allowLan: boolean;
  mode: ProxyMode;
  logLevel: LogLevel;
  autoUpdateIntervalHours: 6 | 12 | 24;
  autoSwitchLowestLatency: boolean;
  proxyDownload: boolean;
  launchAtLogin: boolean;
  silentStart: boolean;
  closeAction: "tray" | "quit";
  channel: "stable" | "beta";
  language: string;
  theme: "light" | "dark" | "system";
  accent: "coral" | "mint" | "sunny";
  menuBarLatency: boolean;
}

export type GatewayStream = "traffic" | "log";
export type StreamHandler = (event: TrafficSample | LogLine) => void;

export interface Gateway {
  status(): Promise<Status>;
  groups(): Promise<ProxyGroup[]>;
  select(groupId: string, nodeName: string): Promise<void>;
  testGroup(groupId: string): Promise<void>;
  testAllGroups(): Promise<void>;
  setMode(mode: ProxyMode): Promise<void>;
  setSystemProxy(on: boolean): Promise<void>;

  connections(): Promise<Connection[]>;
  closeConnection(id: string): Promise<void>;
  closeAllConnections(): Promise<void>;

  rules(): Promise<Rule[]>;
  reloadRules(): Promise<void>;

  profiles(): Promise<Profile[]>;
  addProfile(url: string): Promise<void>;
  removeProfile(id: string): Promise<void>;
  refreshProfile(id: string): Promise<void>;

  settings(): Promise<Settings>;
  updateSettings(patch: Partial<Settings>): Promise<void>;

  /** Returns an unsubscribe function; callers must call it on unmount. */
  subscribe(stream: GatewayStream, onEvent: StreamHandler): () => void;
}
