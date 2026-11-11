# 14: 内核下载与自更新

**What to build:** 让「刚装好的 GoClash」真的能用。现在应用不带内核，`settings.json` 里 `corePath` 为空时首页只会显示「内核不可用，重启内核」——对第一次打开应用的人来说，这是一个死胡同。这张票把下载、落到磁盘、接管进程三步补齐。

**Blocked by:** 09 (真实网关), 11 (系统服务，替换内核后要 kickstart 守护进程)

**Status:** done

- [x] `internal/corefetch`：唯一一个碰 GitHub 的包。`Latest(ctx, channel)` 读 `releases/latest`（稳定）/ `releases?per_page=1`（测试版，含预发布），`Pick` 从资产里按 `-<os>-<arch>-` 选平台包（排除 `compatible` 变体、只认 `.gz`），`Install` 下载 → gunzip → chmod 0755 → 原子 rename 到 `<配置目录>/cores/<tag>/mihomo`
- [x] 平台包不存在时明确报错，不用「下载了一个跑不起来的二进制」冒充成功；Windows 的发布包是 zip，本期直接说明不支持
- [x] 下载体积上限 128MB，超过即中止（防止上游挂了个错误资产把磁盘写满）
- [x] 进度回调节流到 ~120ms，网关转成 `gateway:core` 事件推给界面；`CoreStatus.progress` 同时保留数值，晚挂载的窗口也能画出进度
- [x] 网关新增 `CoreStatus()` / `CheckCoreUpdate()` / `DownloadCore()`。`CoreStatus` 只读磁盘与缓存，**绝不联网**——设置页每次挂载都会调它
- [x] 启动时 `adoptCore()`：`corePath` 为空但 `cores/` 里有内核，自动认领最新的那个，老用户升级/手装的内核都能直接用
- [x] 下载完成后写回 `corePath`、重建 `CoreProcess` 并重启；若守护进程在跑（TUN 已开）则改调 `kickstart`，不然用户空间会再起一个抢端口的进程
- [x] 下载失败保留原有内核与 `corePath`，只在日志里说清楚，不把可用状态清空
- [x] 设置页「内核」卡片：版本行变成「已装版本 + 更新/检查按钮」，下载中把整行换成 4px 进度条 + 百分比；状态文案区分已是最新 / 有新版本 / 未安装
- [x] 首页错误态分流：`coreStatus().state === "missing"` 时改成「还没有内核」+ 一个下载按钮（带同样的进度条），而不是让用户去点注定失败的「重启内核」
- [x] 前端 mock 同步实现三个方法 + 进度事件（约 1.2s 走完），保证纯浏览器预览里也能演示
- [x] 测试：corefetch 7 条（选包 4 种、缺平台、稳定版解析、测试版解析、安装可执行、HTTP 失败）+ 网关 4 条（缺失、认领已有内核、下载后接管、检查更新报告落后）+ 前端 2 条（设置页下载流程、首页首次运行入口）

## Comments

- **为什么不内嵌内核**：内嵌意味着仓库里放一个我们无法从源码重建的 30MB 二进制，并且用户无法确认它是不是自己信任的那一个。下载 + 落盘 + 显示路径与版本，把这件事留在明面上。
- **为什么 GitHub 是唯一外部依赖**：mihomo 的 release 只有 GitHub 一处。国内网络直连大概率失败，所以下载走 `settings.proxyDownload` 同一条路径（经内核混合端口），与订阅下载保持一套逻辑。
- **版本号来源**：目录名就是 tag（`cores/v1.19.2/`），`CoreStatus.Version` 去掉前缀 `v` 与内核 `/version` 的格式对齐。不 exec 二进制去问版本——那会在每次打开设置页时多一次进程启动。
- **旧内核不删**：版本切换后旧目录留着（每个约 30MB）。删除正在被守护进程引用的二进制会让 TUN 在下次重启时静默失败，这个代价比 30MB 磁盘大。
- **验证边界**：GitHub 响应结构与资产命名用真实 `releases/latest` 抓下来的字段固化成测试；`httptest` 覆盖下载、解压、可执行位与进度。真实链路跑过一遍（`GOCLASH_LIVE_CORE=1 go test ./internal/corefetch -run Live -v`）：v1.19.34 / 127 个资产 → 选中 `mihomo-darwin-arm64-v1.19.34.gz` → 落地 54.1MB、模式 `-rwxr-xr-x` → 二进制自报 `Mihomo Meta v1.19.34 darwin arm64`。未验证的只剩「新内核接管一个正在跑的旧内核」这一段，本机没有常驻内核可换。
