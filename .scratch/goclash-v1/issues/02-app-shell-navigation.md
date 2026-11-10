# 02: 应用外壳（侧栏导航 + 标题栏）

**What to build:** 用户能在一个窗口里在七个页面之间来回切换，并且始终知道自己在哪里。左侧是品牌块 + 七项导航 + 内核状态卡，顶部是标题栏，右侧是页面容器。切换页面时主区标题、副标题随之变化，侧栏不动。应用根组件接受一个数据网关参数，默认注入内存 mock。

**Blocked by:** 01 (工具链、视觉 token 与窗口尺寸)

**Status:** done

- [x] 侧栏固定 240px，含品牌块（GC 方块 + 名称 + 副标题）、七项导航（首页/代理/订阅/连接/规则/日志/设置）、底部内核状态卡（运行时长 + 混合端口）
- [x] 当前页导航项：珊瑚底 + 4px 墨黑边 + 4px 薄荷硬阴影 + 白色文字与图标；其余项无边框无底色，hover 换阳光底
- [x] 标题栏 44px：应用名、版本号、「系统代理已接管」小标签；与侧栏之间用 4px 墨黑分隔线
- [x] 点击任意导航项，右侧主区切换到对应页面并显示该页标题与副标题（一条走 seam 的用例覆盖）
- [x] 主区 padding 28、纵向节奏 20；内容超出时只滚动内容区，侧栏与标题栏保持不动
- [x] 未实现的页面先渲染占位（页面标题 + 一句「本页施工中」），保证任意时刻都没有白屏

## Comments

- 2026-11-10 — 落地。`shell/shell.tsx`（标题栏 + 侧栏 + 页面容器）、`shell/pages.tsx`（PageId / PAGES 注册表）、`shell/page-placeholder.tsx`；`App.tsx` 现在接受 `gateway?: Gateway`，默认 mock 单例。
- 网关契约从 spec 落成 `gateway/types.ts`：status/groups/connections/rules/profiles/settings + traffic/log 订阅流；除 spec 之外补了 `testAllGroups`、`reloadRules`、`addProfile/removeProfile/refreshProfile`（07 号票的动作需要）。
- 导航激活态用了 4px 边框，未激活项用 `border-transparent` 占住同样的宽度，避免文字在切换时左右抖动 4px。
- 快速刷新约束：`pages.tsx` 同时导出组件与常量会触发 `react-refresh/only-export-components`，占位组件已拆到独立文件。
- 测试 4 条：激活态标记、切页、内核状态卡异步出现、标题栏提示；构建产物截图与 02 画板比对过（标题栏/侧栏/占位板/阴影全部对位）。
