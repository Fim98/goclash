# 09: 真实网关（Go 侧）

**What to build:** 把网关契约从 TS mock 挪到 Go：一个 Wails 服务直连 mihomo 外部控制器（REST + WS），设置与订阅元数据落盘，主窗与托盘共用同一份状态；浏览器预览与测试退回内存 mock。

**Blocked by:** 07 (订阅/设置), 08 (托盘浮窗)

**Status:** done

- [x] `internal/mihomo`：REST（version / configs / proxies / select / delay / connections / close / rules）+ WS（`/traffic`、`/logs`），带 Bearer 鉴权、错误体透传、`Stream` 逐条回调；单测覆盖映射、鉴权头、查询参数、流式消息
- [x] `Gateway` 服务（绑定名 `main.Gateway.*`）：契约 23 个方法全量实现；`Status` 的出口取当前策略组（rule→节点选择 / global→GLOBAL / direct→DIRECT），延迟取节点最近一次测速
- [x] 设置持久化到 `~/Library/Application Support/GoClash/settings.json`：改动即时合并、保存，并把内核拥有的子集（mode / tun / mixed-port / allow-lan / log-level）推给内核；其余字段仅本地
- [x] 订阅：AddProfile 下载 → 存 `profiles/<id>.yaml` → 通知内核重载（`PUT /configs?force=true`）；RefreshProfile 重下并更新用量/到期（读 `subscription-userinfo`）；RemoveProfile 删文件并清 active；列表 URL 脱敏
- [x] 事件：`gateway:traffic`（`/traffic` 流 + 5s 连接数）、`gateway:log`（`/logs`，等级按设置）；断线 2s 重连
- [x] 前端 `gateway/client.ts`：`Call.ByName("main.Gateway.X")` + `Events.On`；启动时 `Ping` 探测——桥不存在（浏览器/测试）退回 mock，桥存在但内核挂了则保留真实网关、让页面走错误面板
- [x] 内核进程：`settings.corePath` 配置时启动 / 重启 / 退出清理；未配置时 `RestartCore` 返回明确错误而不是假装成功
- [x] 测试：Go 6 个用例（状态映射、分组策略与延迟、选择、规则与连接映射、设置持久化与内核推送、订阅增删与重载）+ 客户端 5 个用例；前端桥 4 个用例（58+2 条全绿）
- [ ] 未做（明确留白）：系统代理的 OS 层应用（networksetup）、内核下载与自更新、出口 IP/ASN 查询、订阅定时自动更新、规则集按 provider 粒度重载

## Comments

- **不生成绑定**：服务 FQN 就是 `package.Type.Method`（`main.Gateway.Status`），`Call.ByName` 十行表达完，省掉 build 里的 codegen 步骤；代价是没有 TS 类型推导，但契约类型本来就在 `gateway/types.ts` 手写维护。
- **设置落盘是 ticket 07 验收的真正兑现**：之前"切页再回来仍是新值"只是内存 mock；现在是配置文件，重启应用仍在。
- **`Status.ExitIp` / `ExitAsn` 目前为空**：没有外部 IP 查询（不想为一个字段引入第三方服务）。UI 因此改为「— / 出口地区未获取」，没有地区时隐藏两个徽章——这是本轮唯一的 UI 回改。
- **connected 语义收紧**：= 系统代理开启（Status 本身能返回即内核可达）。关掉开关不再意味着内核断开。
- **订阅节点数**：从内核 `/proxies` 计算（排除 DIRECT/REJECT 等内置项），YAML 里的 `proxies` 数量只用作载入初值——避免把规则集条目误算成节点。
- **内核二进制是显式配置项**（`settings.json` 的 `corePath`），v1 不内置；没配就让「重启内核」明确报错，避免死按钮。
- **环境限制**：本机没有 mihomo，REST/WS 全部用 `httptest` 假控制器验证（含 WS 握手）；真实内核联调需要在装好 core 的机器上跑一遍 `wails3 dev`。
