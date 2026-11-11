# 内核以特权 launchd 服务运行

TUN 需要创建虚拟网卡并改路由表，这两件事都必须 root。方案不是「应用整体提权」，而是把一个最小职责的守护进程交给 launchd：`com.goclash.core`，它只做一件事——以 root 启动 mihomo，参数与用户态启动完全一致。

安装动作由应用通过一次 `osascript ... with administrator privileges` 触发：把 plist 从 base64 写入 `/Library/LaunchDaemons/`，改属主 `root:wheel`，`launchctl bootstrap system` 加载。卸载是反过程（`bootout` + 删文件）。应用本身始终以普通用户运行。

**为什么不用 sudoers 白名单或 SMJobBless：**
- sudoers 白名单等同于给应用永久免密 root，攻击面远大于一个启动参数固定的守护进程。
- SMJobBless 需要 Developer ID 签名与独立的 helper bundle，当前没有签名流水线。

**Consequences:**
- 服务安装后内核归 launchd 管：应用不再自己 `exec` 内核（避免抢同一端口），「重启内核」改为 `launchctl kickstart -k`。
- 每次安装/卸载/重启都会弹一次系统授权框，这是有意为之——特权操作必须有人点。
- 服务读取的是应用配置目录里的订阅文件；用户删掉订阅后服务仍会按旧文件启动，直到下次安装或重启。
- 未签名分发时，plist 指向的二进制路径必须由用户显式配置（`settings.json` 的 `corePath`），应用不下载、不内置内核。
- Linux（systemd unit）与 Windows（服务）没有实现。这两个平台的差异不在命令，而在权限模型与打包，宁可显式报「不支持」也不发未验证的特权代码。
