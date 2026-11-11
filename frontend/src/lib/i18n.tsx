import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";

/**
 * Two-language support without a dependency.
 *
 * The Chinese string *is* the message key. That gives us three things a
 * key-per-id table cannot: the Chinese rendering can never drift from the key,
 * a translation that was forgotten is a TypeScript error instead of a blank
 * label, and the diff of a copy change stays readable. Placeholders use
 * `{name}` and are filled from the second argument.
 */

export const LOCALES = ["zh-CN", "en-US"] as const;

export type Locale = (typeof LOCALES)[number];

/** Native names on purpose: a language list is never translated. */
export const LANGUAGE_LABEL: Record<Locale, string> = {
  "zh-CN": "简体中文",
  "en-US": "English",
};

const EN = {
  全部: "All",
  代理: "Proxy",
  直连: "Direct",
  拦截: "Reject",
  读取连接失败: "Couldn't load connections",
  "内核没有应答连接列表请求。稍后重试；若持续失败请查看日志。":
    "The kernel did not answer the connections request. Try again; check the logs if it keeps failing.",
  "主机 / HOST": "HOST",
  命中规则: "Rule",
  出口节点: "Exit",
  上下行: "Up / Down",
  时长: "Duration",
  "搜索主机或规则…": "Search host or rule…",
  搜索主机或规则: "Search host or rule",
  自动刷新: "Auto refresh",
  当前没有活动连接: "No active connections",
  该筛选下没有连接: "Nothing under this filter",
  "发出请求后，这里会实时列出每条连接、命中的规则与出口节点。":
    "Once traffic flows, every connection, the rule it hit and its exit node show up here.",
  "换一个类型或清空搜索词再试。": "Try another type, or clear the search.",
  活动连接: "Active",
  规则: "Rules",
  全局: "Global",
  "按规则集自动分流，命中即走对应策略组": "Routes by rule set — the first hit decides the group",
  "全部流量经当前节点转发，不做分流": "Everything goes through the current node",
  "全部流量直连，不经过任何节点": "Everything goes direct, no node involved",
  内核下载失败: "Core download failed",
  正在下载内核: "Downloading the core",
  还没有内核: "No core yet",
  "GoClash 不自带内核。下载 mihomo 官方发布包（约 30MB），装好即可连接节点。":
    "GoClash ships without a core. Download the official mihomo build (~30 MB) and you can connect.",
  "下载中…": "Downloading…",
  下载内核: "Download core",
  内核下载进度: "Core download progress",
  内核暂时不可用: "Core unavailable",
  "无法从内核读取代理信息。重启内核通常可恢复；若持续失败请查看日志。":
    "The kernel is not answering. Restarting it usually helps; check the logs if it keeps failing.",
  打开设置: "Open settings",
  下载速度: "Download",
  上传速度: "Upload",
  统计窗口: "Window",
  代理模式: "Mode",
  刷新出口信息: "Refresh exit info",
  未连接: "Disconnected",
  "系统代理已关闭 · 流量不再经过 GoClash": "System proxy off · traffic bypasses GoClash",
  系统代理: "System proxy",
  时间: "Time",
  等级: "Level",
  输出: "Output",
  自动滚动: "Auto scroll",
  还没有日志输出: "No log output yet",
  该等级下暂无输出: "Nothing at this level",
  "连接活动、DNS 查询与规则命中会实时写到这里。":
    "Connections, DNS lookups and rule hits stream in here.",
  "换一个等级，或清除筛选查看全部输出。": "Pick another level, or clear the filter.",
  日志输出: "Log output",
  自动滚动已开启: "Auto scroll on",
  自动滚动已暂停: "Auto scroll paused",
  显示全部等级: "Show all levels",
  读取订阅失败: "Couldn't load profiles",
  "内核没有应答订阅列表请求。重试一次；若持续失败请查看日志。":
    "The kernel did not answer the profile list. Try again; check the logs if it keeps failing.",
  还没有订阅: "No profiles yet",
  "粘贴一个订阅链接，载入后节点与策略组会出现在代理页。":
    "Paste a subscription link — nodes and groups show up on the Proxies page once it loads.",
  订阅链接: "Subscription URL",
  节点数: "Nodes",
  到期: "Expires",
  上次更新: "Updated",
  "v1 暂未接入 YAML 编辑器": "The YAML editor lands in v1.1",
  "编辑 YAML": "Edit YAML",
  "覆写 42 条规则": "Overrides 42 rules",
  "混合端口改为 7891": "Sets the mixed port to 7891",
  "日志等级 info": "Log level info",
  自动更新: "Auto update",
  更新间隔: "Interval",
  更新后自动切到延迟最低节点: "Switch to the fastest node after updating",
  通过代理下载订阅地址: "Download subscriptions through the proxy",
  读取代理失败: "Couldn't load proxies",
  "内核没有应答策略组请求。重试一次；若持续失败请查看日志。":
    "The kernel did not answer the proxy groups. Try again; check the logs if it keeps failing.",
  "策略组与节点来自订阅。去订阅页粘贴一个链接，载入后这里就会出现。":
    "Groups and nodes come from a subscription. Paste a link on the Profiles page.",
  "搜索节点…": "Search nodes…",
  搜索节点: "Search nodes",
  "测速中…": "Testing…",
  全部测速: "Test all",
  链式代理: "Chained proxy",
  还没有订阅流量数据: "No quota data yet",
  读取规则失败: "Couldn't load rules",
  "内核没有应答规则集请求。更新一次规则通常能恢复。":
    "The kernel did not answer the rule sets. Updating the rules usually fixes it.",
  类型: "Type",
  规则内容: "Rule",
  匹配策略: "Policy",
  命中次数: "Hits",
  "搜索域名或 IP…": "Search domain or IP…",
  "搜索域名或 IP": "Search domain or IP",
  "更新中…": "Updating…",
  更新规则: "Update rules",
  没有匹配的规则: "No rules match",
  规则列表: "Rules",
  "按命中排序仅影响显示，匹配仍按配置顺序自上而下":
    "Sorting by hits only changes the view — matching stays top-down.",
  "规则自上而下匹配，命中即停": "Rules match top-down and stop at the first hit",
  珊瑚: "Coral",
  薄荷: "Mint",
  阳光: "Sunny",
  内核操作失败: "Core action failed",
  读取设置失败: "Couldn't load settings",
  "内核没有应答设置请求。稍后重试；若持续失败请查看日志。":
    "The kernel did not answer the settings request. Try again later; check the logs.",
  网络: "Network",
  "TUN 模式 · 需要系统服务": "TUN · needs the system service",
  "安装中…": "Installing…",
  安装服务: "Install service",
  "TUN 模式": "TUN mode",
  混合端口: "Mixed port",
  允许局域网连接: "Allow LAN",
  内核: "Core",
  日志等级: "Log level",
  内核版本: "Core version",
  内核自动更新: "Auto-update the core",
  外观: "Appearance",
  主题: "Theme",
  浅色: "Light",
  深色: "Dark",
  跟随: "System",
  菜单栏显示实时延迟: "Show live latency in the menu bar",
  界面语言: "Language",
  强调色: "Accent",
  系统: "System",
  开机自动启动: "Launch at login",
  "静默启动 · 不显示主窗口": "Silent start · no main window",
  静默启动: "Silent start",
  关闭窗口时: "On window close",
  最小化到托盘: "Minimise to tray",
  退出程序: "Quit",
  更新通道: "Channel",
  稳定版: "Stable",
  测试版: "Beta",
  未安装: "Not installed",
  检查更新: "Check for updates",
  更新: "Update",
  实时流量图: "Live traffic",
  首页: "Home",
  "连接状态 · 实时流量 · 出口信息": "Status · live traffic · exit info",
  "8 个策略组 · 126 个节点 · 延迟检测 300s": "8 groups · 126 nodes · latency test 300s",
  订阅: "Profiles",
  "2 个远程配置 · 1 个本地配置 · 自动更新每 12 小时": "2 remote · 1 local · auto-update every 12h",
  连接: "Connections",
  "42 条活动连接 · 进程嗅探开启": "42 active · process sniffing on",
  "1284 条规则 · 12 个规则集 · 最后更新 3 小时前": "1284 rules · 12 rule sets · updated 3h ago",
  日志: "Logs",
  "实时输出 · 缓冲区 512 条 · 等级 info 及以上": "Live output · 512-line buffer · info and up",
  设置: "Settings",
  "GoClash 3.0.0 · mihomo 1.19.4 · 服务模式运行中": "GoClash 3.0.0 · mihomo 1.19.4 · service mode",
  主导航: "Main navigation",
  "mihomo 运行中": "mihomo running",
  内核未连接: "Core offline",
  等待内核应答: "Waiting for the core",
  关闭浮窗: "Close popup",
  已连接: "Connected",
  系统代理已关闭: "System proxy off",
  下载: "Download",
  上传: "Upload",
  出错了: "Something went wrong",
  暂无内容: "Nothing here",
  "Clash Meta 客户端": "Clash Meta client",
  从剪贴板导入: "Import from clipboard",
  代理提供者: "Proxy providers",
  全部关闭: "Close all",
  全部更新: "Update all",
  "内核没有应答，稍后重试或打开主界面查看日志。":
    "The kernel is not answering. Try again, or open the main window for the logs.",
  "出口 IP": "Exit IP",
  出口地区未获取: "Region unknown",
  删除: "Delete",
  删除后需用链接重新导入: "Deleting means re-importing the link",
  刷新: "Refresh",
  "原生 IP": "Native IP",
  去订阅页: "Go to Profiles",
  "双跳加密 · 速度会明显下降": "Two hops, encrypted · noticeably slower",
  取消: "Cancel",
  名称: "Name",
  导入订阅: "Import profile",
  已合并: "Merged",
  已用流量: "Used",
  延迟: "Latency",
  当前使用: "In use",
  当前出口: "Current exit",
  当前系统不支持: "Not supported on this system",
  打开主界面: "Open main window",
  打开日志: "Open logs",
  打开日志目录: "Open log folder",
  打开配置目录: "Open config folder",
  按命中排序: "Sort by hits",
  按延迟排序: "Sort by latency",
  排序: "Sort",
  新建订阅: "New profile",
  无匹配节点: "No matching nodes",
  日志目录: "Log folder",
  "最后更新 3 小时前": "Updated 3h ago",
  最近命中: "Recent hits",
  "服务运行中 · 卸载": "Service running · uninstall",
  "本地配置 · config.yaml": "Local config · config.yaml",
  查看全部: "View all",
  "正在读取内核状态…": "Reading kernel status…",
  流量统计: "Traffic",
  添加: "Add",
  清空: "Clear",
  清除筛选: "Clear filter",
  现在: "Now",
  确认删除: "Confirm delete",
  立即更新: "Update now",
  立即测速: "Test now",
  "系统代理 ON": "System proxy ON",
  系统代理已接管: "System proxy on",
  编辑配置: "Edit config",
  "自动刷新 1s": "Refresh 1s",
  "规则覆写 42 条 · 端口覆写 7891 · 最后编辑 昨天 14:02":
    "42 rule overrides · port 7891 · edited yesterday 14:02",
  订阅流量: "Quota",
  "通过 Merge 与 Script 覆写远程订阅，订阅更新时不会被覆盖":
    "Override the remote profile with Merge and Script patches that survive updates",
  重启内核: "Restart core",
  重新载入: "Reload",
  重试: "Retry",
  "关闭 {host}": "Close {host}",
  "仅显示 {level}": "{level} only",
  "编辑 {name}": "Edit {name}",
  "删除 {name}": "Delete {name}",
  "测速 {name}": "Test {name}",
  "更新 {name}": "Update {name}",
  "已用 {percent}% · {date} 到期": "{percent}% used · expires {date}",
  "强调色 {accent}": "Accent: {accent}",
  "运行 {uptime} · 混合端口 {port}": "Up {uptime} · mixed port {port}",
  "{mode}模式 · 延迟 {latency} · 出口 {ip}": "{mode} mode · latency {latency} · exit {ip}",
  debug: "debug",
  info: "info",
  warn: "warn",
  error: "error",
  DOMAIN: "DOMAIN",
  "IP-CIDR": "IP-CIDR",
  GEOIP: "GEOIP",
  "RULE-SET": "RULE-SET",
  "显示 {shown} / {total} 条 · 超过 1 分钟未活动的连接自动隐藏":
    "Showing {shown} of {total} · idle connections drop after a minute",
  "已关闭 {count} 条": "{count} closed",
  "命中 · {policy}": "Hit · {policy}",
  "{nodes} 节点 · {when}更新": "{nodes} nodes · updated {when}",
  "显示 {shown} / {total} 条 ·": "Showing {shown} of {total} ·",
  "{label} · 本页施工中": "{label} · under construction",
  "节点 · {name}": "Node · {name}",
  中国香港: "Hong Kong, China",
  中国澳门: "Macao, China",
  中国台湾: "Taiwan, China",
  中国大陆: "Mainland China",
  日本: "Japan",
  新加坡: "Singapore",
  韩国: "South Korea",
  美国: "United States",
  英国: "United Kingdom",
  德国: "Germany",
  法国: "France",
  加拿大: "Canada",
  澳大利亚: "Australia",
  荷兰: "Netherlands",
  俄罗斯: "Russia",
  印度: "India",
  土耳其: "Türkiye",
  马来西亚: "Malaysia",
  泰国: "Thailand",
  越南: "Vietnam",
  菲律宾: "Philippines",
  印度尼西亚: "Indonesia",
  阿联酋: "United Arab Emirates",
  巴西: "Brazil",
} as const satisfies Record<string, string>;

/** Every string the UI can render. A typo is a compile error, not a blank label. */
export type MessageKey = keyof typeof EN;

export type MessageVars = Record<string, string | number>;

/** Fills `{name}` placeholders; unknown names stay visible instead of vanishing. */
export function translate(locale: Locale, key: MessageKey, vars?: MessageVars): string {
  const template: string = locale === "en-US" ? EN[key] : key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}

/** Accepts whatever an older settings.json stored ("简体中文") and normalises it. */
export function localeFromSetting(raw: string | undefined): Locale {
  if (!raw) return "zh-CN";
  if (raw === "en-US" || raw.toLowerCase().startsWith("en")) return "en-US";
  return "zh-CN";
}

const STORAGE_KEY = "goclash.locale";

/**
 * The settings file is the source of truth, but reading it takes a round trip.
 * Caching the choice in localStorage means the window paints in the right
 * language on the first frame instead of flashing Chinese.
 */
export function readStoredLocale(): Locale {
  try {
    return localeFromSetting(window.localStorage.getItem(STORAGE_KEY) ?? undefined);
  } catch {
    return "zh-CN";
  }
}

export function storeLocale(locale: Locale): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Private mode or a locked-down webview: the settings file still has it.
  }
}

export type TFunction = (key: MessageKey, vars?: MessageVars) => string;

interface LocaleContextValue {
  locale: Locale;
  setLocale: (next: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: "zh-CN",
  setLocale: () => {},
});

export function LocaleProvider({
  locale,
  setLocale,
  children,
}: LocaleContextValue & { children: ReactNode }) {
  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

/** A single translated string; the hook keeps the component subscribed. */
export function useT(): TFunction {
  const { locale } = useContext(LocaleContext);
  return useCallback<TFunction>((key, vars) => translate(locale, key, vars), [locale]);
}

export function useLocale(): Locale {
  return useContext(LocaleContext).locale;
}

/** For the settings page: switch language without a reload. */
export function useSetLocale(): (next: Locale) => void {
  return useContext(LocaleContext).setLocale;
}
