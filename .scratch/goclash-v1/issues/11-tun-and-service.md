# 11: TUN 与特权内核服务

**What to build:** 让 TUN 开关产生真实后果。TUN 要建虚拟网卡、改路由表，必须 root；做法是给内核装一个最小职责的 launchd 守护进程 `com.goclash.core`，应用本体保持普通用户。同时把「内核拒绝了设置却仍被存下来」这个说谎问题一起修掉。

**Blocked by:** 09 (真实网关), 10 (桌面集成)

**Status:** done

- [x] `internal/service`：plist 渲染（纯函数）+ 一段式特权脚本（base64 写入 plist、`chown root:wheel`、`chmod 644`、`bootout` 旧任务、`bootstrap` 新任务）、卸载脚本、`kickstart` 重启
- [x] 安装/卸载/重启都通过一次 `osascript ... with administrator privileges`；用户取消时返回「已取消管理员授权」而不是一个裸错误码
- [x] `Status` 分四态：`missing`（无 plist）/ `installed`（有 plist 但 launchd 没在跑）/ `running` / `unsupported`（非 macOS）
- [x] 安装前校验：`corePath` 必须是绝对路径且存在、必须已有可用配置文件、配置目录必须是绝对路径——任一条不满足就在弹授权框之前失败
- [x] 网关：`ServiceStatus` / `InstallService` / `RemoveService`；装之前先停用户态内核（否则抢同一个端口），装失败再把它启回来
- [x] TUN 开关在网关层就被拦住：服务不在 `running` 时返回「TUN 需要系统服务」，不把请求丢给内核换一个用户看不懂的 errno
- [x] 服务运行中时「重启内核」走 `launchctl kickstart -k`；应用启动时也不再自己 exec 内核（避免双实例）
- [x] 设置写入顺序改为「内核先接受、才落盘」：内核拒绝的补丁不再被当作已生效（`KernelRefusalIsNotPersisted`）。纯本地项（主题、语言）不产生内核补丁，因此内核离线时仍可改
- [x] 设置页 TUN 行按服务状态渲染：未装 → 「安装服务」按钮；运行中 → 「服务运行中 · 卸载」；不支持 → 灰字 + 禁用开关
- [x] 测试：Go 新增 service 包 9 条（plist 内容与转义、base64 回解、脚本、shell/AppleScript 转义、配置校验、取消提示、状态分类）+ 网关 7 条（TUN 拦截/放行、安装参数、取消、卸载、重启走守护进程、内核拒绝不落盘）；前端 64 条全绿（新增安装/卸载/不支持三态）

## Comments

- **为什么是 launchd 而不是 sudoers**：sudoers 白名单等于永久免密 root；这个守护进程的参数完全固定，攻击面小得多。SMJobBless 需要 Developer ID 签名，当前没有签名流水线。详见 `docs/adr/0003-privileged-core-service.md`。
- **应用永不提权**：特权只存在于那一次 `osascript` 调用与 launchd 拉起的内核进程，应用本身始终是普通用户。
- **不自动触发安装**：TUN 开关被拒时只给「安装服务」入口，绝不自动弹授权框——特权操作必须有人主动点。
- **双实例是真的会打架**：守护进程和用户态内核读同一份配置、抢同一个 7890，所以安装前必须停用户态，卸载后要启回来。
- **验证边界**：特权安装/卸载**没有真机执行**——它会弹系统授权框并写入 `/Library/LaunchDaemons`，既需要人工点确认，也会在未装内核的这台机器上留下一个指向不存在二进制的守护进程。plist 内容、base64 载荷、命令序列、取消提示、状态分类全部用假 runner 断言；真实链路需要装好 mihomo 后由你点一次「安装服务」。
- **未做**：Linux/Windows 的服务实现、内核下载与校验、TUN 的可用性探测（当前只判断守护进程状态，不判断 utun 是否真的建立）。
