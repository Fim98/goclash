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
  /** Relative label computed server-side on every read ("3 小时前"). */
  updatedAt: string;
  /** Source timestamp in epoch seconds; 0 when the profile predates it. */
  updatedUnix: number;
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
  /** Master switch for profile auto-update; interval only applies when on. */
  autoUpdateEnabled: boolean;
  autoUpdateIntervalHours: 6 | 12 | 24;
  autoSwitchLowestLatency: boolean;
  proxyDownload: boolean;
  /** Chained proxies: traffic goes through two hops; slower but harder to trace. */
  chainedProxy: boolean;
  /** Keep the mihomo core itself up to date. */
  coreAutoUpdate: boolean;
  launchAtLogin: boolean;
  silentStart: boolean;
  closeAction: "tray" | "quit";
  channel: "stable" | "beta";
  language: string;
  theme: "light" | "dark" | "system";
  accent: "coral" | "mint" | "sunny";
  menuBarLatency: boolean;
  /** Endpoint used for the exit IP lookup; empty disables it. */
  exitIPEndpoint: string;
}

/**
 * State of the privileged daemon that owns the core when TUN is on.
 * "unsupported" means the platform has no implementation at all.
 */
export type ServiceState = "missing" | "installed" | "running" | "unsupported";

export interface ServiceStatus {
  state: ServiceState;
}

/**
 * The core binary on disk. "missing" is the first-run state: nothing to run,
 * which is why the app shows a download button instead of an error.
 */
export type CoreState = "missing" | "ready" | "outdated" | "downloading";

export interface CoreStatus {
  state: CoreState;
  /** Installed version, without the leading "v"; "" when nothing is installed. */
  version: string;
  /** Newest release from the last check; "" until a check has succeeded. */
  latest: string;
  path: string;
  /** 0–1 while downloading. */
  progress: number;
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
  /** Re-queries the exit IP through the kernel and returns the fresh status. */
  refreshExitIP(): Promise<Status>;
  /** Whether the launchd daemon is installed; TUN needs it running. */
  serviceStatus(): Promise<ServiceStatus>;
  /** Writes the daemon and boots it; prompts for admin rights. */
  installService(): Promise<void>;
  removeService(): Promise<void>;
  /** Best-effort kernel restart; resolves once the core answers again. */
  restartCore(): Promise<void>;

  /** What is on disk right now. Never hits the network. */
  coreStatus(): Promise<CoreStatus>;
  /** Asks the release feed for the newest version. Needs the network. */
  checkCoreUpdate(): Promise<CoreStatus>;
  /** Downloads the platform build, installs it and restarts the core. */
  downloadCore(): Promise<CoreStatus>;
  /** Progress pushes while a download runs; returns an unsubscribe function. */
  onCoreProgress(handler: (status: CoreStatus) => void): () => void;

  connections(): Promise<Connection[]>;
  closeConnection(id: string): Promise<void>;
  closeAllConnections(): Promise<void>;

  rules(): Promise<Rule[]>;
  reloadRules(): Promise<void>;

  /** Drops the kernel log buffer; the log page mirrors it locally. */
  clearLogs(): Promise<void>;
  /** Opens the kernel log directory in the OS file manager. */
  openLogDirectory(): Promise<void>;
  /** Opens the app config directory in the OS file manager. */
  openConfigDirectory(): Promise<void>;

  profiles(): Promise<Profile[]>;
  addProfile(url: string): Promise<void>;
  removeProfile(id: string): Promise<void>;
  refreshProfile(id: string): Promise<void>;

  settings(): Promise<Settings>;
  updateSettings(patch: Partial<Settings>): Promise<void>;

  /** Returns an unsubscribe function; callers must call it on unmount. */
  subscribe(stream: GatewayStream, onEvent: StreamHandler): () => void;
  /**
   * Fires when a background profile refresh changes the list, so an open
   * profiles page can repaint without polling.
   */
  onProfilesChanged(handler: () => void): () => void;
}
