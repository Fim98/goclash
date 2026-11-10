# 自建视觉层，只借用 shadcn 的行为

俏皮野兽派的约束（零圆角、4px 墨黑边、硬阴影、-2°~3° 旋转）与 shadcn/ui 的默认 token（`--radius` 0.5rem、柔和 ring、语义化 `--primary`）方向相反。若直接使用 shadcn 的 Button/Card，会出现「一半圆角一半直角」的割裂，且每个调用点都要写一长串覆盖类名。

因此：按钮、卡片、标签、开关、分段、表格等视觉原语全部自写；shadcn 只保留为 `cn()` 与行为原语（Dialog、Tooltip、Select 等后续按需引入）的来源。同时把 shadcn 的 CSS 变量覆盖到本项目的色板（`--primary` 珊瑚、`--ring` 墨黑、`--radius` 0），保证以后引入任何 shadcn 组件都自动落在风格内，不需要逐处补丁。
