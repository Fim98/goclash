# 01: 工具链、视觉 token 与窗口尺寸

**What to build:** 应用打开时是一块 1440×900 的空白野兽派画布：白底、没有任何示例内容。仓库具备跑测试的能力，颜色与字体已经作为 token 存在，后续页面直接可用。Wails 示例界面（打招呼、每秒时间、主题切换 demo）全部移除。

**Blocked by:** None (can start immediately)

**Status:** done

- [x] Vitest + Testing Library + jsdom 接好，`npm test` 可运行；至少有 1 条通过的测试（可以是纯函数或渲染冒烟）
- [x] Tailwind `@theme` 暴露墨黑/白/珊瑚/薄荷/阳光/海沫/蜜桃七色、Inter 与中文回退字体栈、所有 radius 归零
- [x] shadcn 的 CSS 变量被覆盖到同一套语义（`--primary` 珊瑚、`--ring` 墨黑、`--radius` 0），以后引入任何 shadcn 组件不会跳色
- [x] 全局基线：`prefers-reduced-motion` 下禁用位移与旋转；焦点环为 4px 墨黑 outline + 2px offset
- [x] 删除 Wails 示例界面与其依赖（主题切换、greet 表单），根组件渲染空白画布
- [x] Wails 窗口 1440×900、白色背景、标题 `GoClash`；macOS 保留原生红绿灯，不渲染假点
- [x] CI 增加测试步骤，与已有的 prettier/eslint/tsc 并列

## Comments

- 2026-11-10 — 落地。`npm run check`（prettier + eslint + tsc + vitest）与 `gofmt` / `go vet` / `go build` 全绿；前端产物 141KB JS + 11KB CSS，Inter 以可变字体子集打包（latin 48KB），未引入中文字体包。
- 窗口外框决策：**没有**画 4px 整窗外描边。macOS 窗口自带圆角与阴影，再套一圈直角黑框会在四角露出破绽；结构感改由内部 4px 分隔线承担（标题栏下沿、侧栏右侧）。这条已并入 spec 的窗口决策。
- 字体决策：拉丁用 `@fontsource-variable/inter`，中文走系统栈（PingFang SC / 微软雅黑 / Noto Sans SC）。`next-themes` 与 Geist 字体包随之移除。
- 测试 seam 首次建立：`App.test.tsx` 只断言渲染结果，为 02 号票的 `gateway` 注入留位置。
