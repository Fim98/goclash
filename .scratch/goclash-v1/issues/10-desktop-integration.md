# 10: 桌面集成（系统代理 / 订阅定时更新 / 菜单栏延迟）

**What to build:** 把 09 号票里明确留白的三件事补上——系统代理真正写入操作系统、订阅按间隔自动更新并在更新后切到最低延迟节点、菜单栏显示当前出口延迟。三件都不新增页面，只让现有开关与设置产生真实后果。

**Blocked by:** 09 (真实网关), 08 (托盘浮窗)

**Status:** done

- [x] `internal/sysproxy`：跨平台系统代理层。macOS 用 `networksetup` 写 HTTP/HTTPS/SOCKS 三项 + 绕过列表；Linux 用 `gsettings`；Windows 写 WinINET 注册表并 `InternetSetOption` 通知浏览器刷新；其它平台返回明确的「不支持」而不是静默成功
- [x] 网络服务选择：读 `route -n get default` 的接口，再在 `networksetup -listnetworkserviceorder` 里找绑定该接口的服务——本机服务顺序第一条是闲置的 Thunderbolt Bridge（bridge0），只取「第一个启用项」会写错对象
- [x] `SetSystemProxy` 改为「先落系统、成功才落盘」；失败时返回错误，UI 开关回弹而不是假装开着
- [x] 设置页的 `systemProxy` 补丁与混合端口变更同样走这层；端口改了会按新端口重新应用
- [x] 启动时按持久化设置重新应用，但**先确认内核应答**——否则开着开关却没跑内核时，会把整台机器的请求指向死端口；退出时关闭，避免留下指向已退出代理的机器
- [x] 订阅定时更新：按 `autoUpdateEnabled` / `autoUpdateIntervalHours` 轮询，关掉开关 5 分钟内生效（不必重启）；逐个刷新订阅并记录失败
- [x] 更新后若开启「自动切最低延迟」，用内核已有的延迟历史选最低节点并 `select`——不重新测速，避免定时任务变成 128 次探测风暴
- [x] `Profile.updatedAt` 改为读取时计算（持久化 `updatedUnix`）；此前「刚刚」会永远停在被刷新的那一刻
- [x] 后台刷新后发 `gateway:profiles` 事件，已打开的订阅页自动重绘；契约新增 `onProfilesChanged`
- [x] 菜单栏延迟：托盘标签按 5s 刷新（`38 ms` / `—`），受 `menuBarLatency` 与系统代理开关双重约束；值不变时不重绘
- [x] 测试：Go 侧 28 个——sysproxy 10 个（服务解析、选择、三种平台命令序列、darwin 假 runner 端到端、非法端口）与网关 18 个（新增：应用后持久化、失败不落盘、设置页走 OS、端口重应用、更新间隔、最低延迟两条、相对时间、启动闸两条、菜单栏标签）；前端 61 条全绿（新增桥事件、订阅页重绘、开关回弹）

## Comments

- **先落系统再落盘**：顺序反过来会出现「设置说开着、系统其实是关的」。回滚成本比多一次调用高得多，所以 `SetSystemProxy` 是 apply-then-persist，失败直接返回错误让页面 refresh 回真实状态。
- **不写 4px 风格的代偿**：系统代理是 OS 状态，不属于视觉层，`internal/sysproxy` 不含任何 UI 概念。
- **macOS 绕过列表只在开启时写**，关闭时只翻三个 state 开关。`networksetup` 清空 bypass 的写法在不同版本上行为不一致，宁可留着用户已有的列表。
- **定时更新不测速**：`select` 用的是 mihomo 的 `history`。测速是另一件事（代理页的「全部测速」），定时任务里做会让每 12 小时出现一次全节点探测。
- **菜单栏标签的值来源**是 `Status()`（内部 `/version` + `/configs` + `/proxies`），与首页同一个出口判定，不会出现两处显示不同节点。
- **验证边界**：本机没有 mihomo，系统代理的**真实写入**没有执行过（会改用户的网络设置，未经确认不做）。已用假 runner 验证命令序列与服务选择，并用只读命令确认了本机默认路由是 en0、服务顺序第一条是 bridge0——正好是「只取第一个」会踩的坑。
- **仍未做**：TUN 启停与系统服务安装（需要 root 与授权弹窗）、应用更新器、出口 IP/ASN 查询、规则按 provider 粒度重载。
