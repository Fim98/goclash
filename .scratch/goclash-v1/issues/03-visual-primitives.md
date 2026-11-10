# 03: 视觉原语组件集

**What to build:** 一套只负责长相与基础交互的组件，页面只组合它们、不自己写边框和阴影。所有组件共用同一套 hover / active / 焦点规则，开关与分段可键盘操作，表格能同时表达「普通行、选中行、反白行」。

**Blocked by:** 01 (工具链、视觉 token 与窗口尺寸)

**Status:** done

- [x] 按钮三态：珊瑚填充 + 4px 边 + 5px 薄荷影 + -2°；hover 上浮并换成 8px 阳光影、转 3°；active 位移 6px、缩放 0.95、阴影归零；另有白底描边（ghost）与墨黑填充（ink）两个变体
- [x] 图标按钮 26/36/44 三档；小档 2px 边无阴影，大档 4px 边 + 薄荷影
- [x] 卡片带四种以上硬阴影（珊瑚/薄荷/阳光/海沫/蜜桃/墨黑），阴影不参与布局、不模糊
- [x] 标签/徽章/芯片：2px 边、nowrap、`flex: none`，含七种色变体与状态方点
- [x] 分段控件：容器 4px 边、选中项珊瑚填充，`aria-pressed` 标记
- [x] 开关：`role="switch"` + `aria-checked`，空格可切换；尺寸有 46×26 与 132×66 两档
- [x] 输入框三态：默认 4px 边 + 海沫影、聚焦换薄荷影且不改变尺寸、错误态边框与影换珊瑚
- [x] 数据卡：标签 + 32px 大数字 + 右侧图标方块
- [x] 表格：黑表头 46px、行高可配（59/53）、行内支持选中/高亮/反白、页脚贴底；列宽「固定 + 自适应」混排；带 table/row/columnheader/cell 角色
- [x] 状态面板：加载（描边骨架条，不用灰块）、错误（说明 + 主次动作）、空（图标 + 标题 + 主按钮）三态同构
- [x] 每个原语至少 1 条测试（共 13 条）：开关点击/键盘/尺寸、分段选中与回调、表格行数/高亮/页脚、状态面板三态
- [x] `prefers-reduced-motion` 下所有位移与旋转消失，仅保留颜色变化

## Comments

- 2026-11-10 — 落地于 `frontend/src/components/base/`（自建视觉层，见 ADR-0001；shadcn 的行为原语将来从该目录旁引入）。图标统一用 lucide-react 线性图标，描边粗细由调用方控制。
- 硬阴影必须是静态字符串：Tailwind 只扫描源码里的字面量类名，`shadow-[${n}px...]` 这类运行时拼装不会被生成。所以 Card 用了一张 6 色 × 4 尺寸的静态映射表。
- 踩坑一处：Testing Library 的自动 cleanup 只在 vitest `globals: true` 时生效，本项目显式 import 断言 API，于是 DOM 在用例间累积（「Found multiple elements」全是这个）。已在 `src/test/setup.ts` 手动 `afterEach(cleanup)`。
- 动效中性化补丁：Tailwind v4 的 `rotate-2` / `translate-y-1` 输出的是独立 CSS 属性（`rotate` / `translate`），`transform: none` 拦不住；reduced-motion 媒体查询已补上这三个属性。
