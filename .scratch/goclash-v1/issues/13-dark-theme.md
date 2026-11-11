# 13: 深色主题

**What to build:** 设计稿只给了 light。补一套 dark，不加 `dark:` 变体、不引第二套组件——只反转两个结构色（`--ink` / `--surface`），强调色保持不变。

**Blocked by:** 03 (视觉原语), 07 (设置页)

**Status:** done

- [x] token 拆分：`--ink` / `--surface` 为结构色（随主题反转），`--color-on-accent`（固定黑）为「压在强调色上的文字」。shadcn 的语义变量全部改成从 `--ink` / `--surface` 派生，深色块只覆盖这两个值
- [x] 深色值：surface `#0b0b0b`、ink `#f4f1e8`（暖白，不是纯白——纯白在近黑底上过硬，和糖果色不搭）
- [x] 全仓类名归位：`bg-white` → `bg-surface`（33 处）；强调色容器里的 `text-ink` → `text-on-accent`（标签、延迟徽章、日志等级、策略胶囊）；`bg-ink` 反白块里的 `text-white` → `text-surface`（分段选中、表头、MATCH 行、ink 按钮、ink 标签）
- [x] 强调色容器整体定色：首页 Hero、托盘 Hero、当前出口卡设 `text-on-accent`；统计卡与设置卡图标方块同样，避免深色下图标变白压在黄底上
- [x] 开关滑块按**轨道**取色：薄荷轨道配黑滑块，深色轨道配 ink 滑块，Hero 的大开关保持白色滑块（它压在珊瑚上）
- [x] 运行时：`lib/theme.ts` 解析 light/dark/system，`data-theme` 写到 `<html>`；`system` 挂 matchMedia 监听，系统切换外观即刻生效；`main.tsx` 在首帧前应用，避免深色窗口闪白
- [x] 窗口底色跟随：`main.go` 按保存的主题给主窗与托盘窗选背景色（`system` 用 `defaults read -g AppleInterfaceStyle` 判一次）
- [x] 设置页：浅色/深色/跟随全部可用，切换即时上色再落盘
- [x] 测试：`lib/theme` 3 条（解析、写入、无 matchMedia 兜底）+ 设置页 1 条（切深色后 `data-theme=dark`、切页回来仍是深色），共 70 条

## Comments

- **为什么是反转而不是第二套样式**：这套风格的骨架（4px 描边、零圆角、硬影）与颜色无关。只要把「纸」和「墨」对调，所有组件自动成立；写 `dark:` 变体意味着同一个组件有两份样式，改一处漏一处。
- **必须引入 `on-accent`**：第一次跑深色截图时发现标签与延迟徽章全变成白字压黄/薄荷底——因为它们的文字用的是会反转的 `ink`。强调色是恒定的，压在上面的东西也必须恒定。浅色下 on-accent 与 ink 同值，所以这个改动对 light 零影响。
- **踩到的两个真 bug**：① Hero 定了 `text-on-accent` 后，里面的速度芯片（`bg-surface` + 继承文字色）变成黑字压黑底，整块看不见——芯片必须自己声明 `text-ink`；② 开关滑块原来用 `bg-ink`，深色下在薄荷轨道上变成浅色块，对比极低，改成按轨道取色。
- **反白块的语义**：`bg-ink` 的元素（选中分段、表头、MATCH 兜底行）在深色下变成浅色块 + 深色字。这是刻意的，不是「颜色错了」，验收时不要"修"回黑底。
- **验证**：首页/代理/设置/日志四屏在深色下逐一截图核对；浅色重截一张确认无回归（Hero 黑标题、白芯片、白滑块都在）。文字对比度靠 token 保证（ink on surface、on-accent on accent），没有引入中间灰。
- **未做**：`follow system` 的窗口底色只在启动时判一次（运行中切换系统外观，webview 立即变、窗口底色要等下次启动）；设计稿的 Sticker Cluster 仍未使用。
