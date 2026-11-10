# 俏皮野兽派 — 风格参考

> 黑框硬影的骨架不变，但换上五支糖果色，还允许歪一点。

**Theme:** light

俏皮野兽派是新野兽派的年轻版本，骨架完全一致：4px 纯黑边框、零圆角、零模糊的偏移阴影。区别在三点——第一，阴影可以是彩色的，而且 hover 时会换色；第二，元素允许 -2 到 3 度的旋转，hover 时继续转；第三，强调色从四支扩到五支，允许同屏出现三种。动效用带回弹的弹簧曲线（300ms），按下时位移等于阴影偏移并归零。所有装饰必须用图标而不是 emoji，这是它区别于「随便玩」的地方。

## Colors

| Name    | Value     | Token             | Role                                                           |
| ------- | --------- | ----------------- | -------------------------------------------------------------- |
| Ink     | `#000000` | `--color-ink`     | 所有边框、阴影的基准与文字。4px 描边是这套风格不可协商的部分。 |
| White   | `#ffffff` | `--color-white`   | 卡片填充。纯白是为了让五支强调色都能压在上面。                 |
| Coral   | `#ff6b6b` | `--color-coral`   | 主行动与第一阴影色。出现频率最高的强调。                       |
| Mint    | `#4ecdc4` | `--color-mint`    | 第二阴影色与链接，与珊瑚形成冷暖对位。                         |
| Sunny   | `#ffe66d` | `--color-sunny`   | hover 高亮与角标，用于装饰小块。                               |
| Seafoam | `#95e1d3` | `--color-seafoam` | 分类色与状态标记，比薄荷更浅。                                 |
| Peach   | `#f38181` | `--color-peach`   | 情绪化强调，用于收藏、喜欢与推荐角标。                         |

## Typography

### Inter — 全站唯一字体，只用 700 与 900。标题压到行高 1.0，让字块像方块。

- **Substitute:** 'Arial Black', Helvetica, sans-serif
- **Weights:** 700, 900
- **Sizes:** 14, 16, 20, 28, 40, 56
- **Line height:** 1 (display), 1.1 (headings), 1.55 (body)
- **Letter spacing:** -0.03em on display, 0.04em on uppercase labels

### Type Scale

| Role       | Family | Weight | Size | Line Height | Letter Spacing | Token               |
| ---------- | ------ | ------ | ---- | ----------- | -------------- | ------------------- |
| display    | —      | 900    | 56px | 1           | -0.03em        | `--text-display`    |
| heading    | —      | 900    | 40px | 1.05        | -0.02em        | `--text-heading`    |
| subheading | —      | 700    | 28px | 1.15        | —              | `--text-subheading` |
| body-lg    | —      | 700    | 20px | 1.4         | —              | `--text-body-lg`    |
| body       | —      | 700    | 16px | 1.55        | —              | `--text-body`       |
| label      | —      | 700    | 14px | 1.35        | 0.04em         | `--text-label`      |

## Spacing & Layout

**Base unit:** 8px
**Density:** comfortable

### Spacing Scale

| Name | Value | Token          |
| ---- | ----- | -------------- |
| 8    | 8px   | `--spacing-8`  |
| 16   | 16px  | `--spacing-16` |
| 24   | 24px  | `--spacing-24` |
| 32   | 32px  | `--spacing-32` |
| 48   | 48px  | `--spacing-48` |
| 64   | 64px  | `--spacing-64` |
| 96   | 96px  | `--spacing-96` |

### Border Radius

| Element | Value |
| ------- | ----- |
| cards   | 0     |
| buttons | 0     |
| inputs  | 0     |
| tags    | 0     |

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 28px
- **Element gap:** 20px

## Components

### Playful Button

**Role:** 主行动按钮

珊瑚红填充、白字、4px 黑边、零圆角、6px 珊瑚或薄荷硬阴影，默认 -2 度旋转。16px/900、padding 12px 24px。hover 时上浮 4px、右移 1px、旋转到 3 度、阴影换成阳光黄并扩到 8px；按下时位移 6px 6px、缩放 0.95、旋转归零、阴影去除。过渡 300ms 弹簧曲线 cubic-bezier(0.34, 1.56, 0.64, 1)。右上角可放一个 12px 的黄色小方块（2px 黑边）作为角标。

- **Sizes:** padding 12px 24px; label 16px
- **States:** hover: rotate to 3deg, yellow shadow; active: translate 6px, scale 0.95, shadow none

### Tilted Card

**Role:** 内容卡与功能卡

白底、4px 黑边、零圆角、8px 薄荷硬阴影，默认 -1 度旋转，内边距 28px。顶部放一排 16px 的彩色方块（各 2px 黑边）作为装饰序列。hover 时上浮 8px、旋转 2 度、阴影换成珊瑚红并扩到 12px。过渡 300ms 弹簧。

### Square Input

**Role:** 表单输入

白底、4px 黑边、零圆角、padding 12px 16px、16px/700 字。聚焦时加 4px 薄荷硬阴影且不改变尺寸；错误态把边框与阴影都换成珊瑚红。

### Icon Tag

**Role:** 带图标的标签

彩色填充（五支强调色之一）、2px 黑边、零圆角、12px/700 字、padding 4px 10px，左侧配 14px 线性图标。禁止用 emoji 或符号字符替代图标。

### Sticker Cluster

**Role:** 装饰性贴纸组合

由 3 到 5 个 12px 到 24px 的小方块、圆点或星形组成，各自 2px 黑边，分别用不同强调色，整体旋转 -3 度。只用于卡片角落，不承载信息，单屏不超过两组。

## Do's and Don'ts

### Do

- 4px 黑边、零圆角、硬阴影
- 阴影可用彩色并在 hover 换色
- 旋转控制在 -2 到 3 度
- 装饰只用图标，不用 emoji
- 动效 300ms 带回弹
- 同屏最多三种强调色

### Don't

- 不要用任何圆角
- 不要用模糊阴影
- 不要用渐变
- 不要旋转超过 3 度
- 不要用 emoji 或符号字符
- 不要用柔和灰色

## Surfaces

| Level | Name        | Value     | Purpose    |
| ----- | ----------- | --------- | ---------- |
| 0     | White       | `#ffffff` | 页面与卡片 |
| 1     | Coral Block | `#ff6b6b` | 强调区块   |

## Elevation

- **Coral shadow:** `6px 6px 0 #ff6b6b`
- **Mint shadow:** `8px 8px 0 #4ecdc4`
- **Sunny hover:** `8px 8px 0 #ffe66d`
- **Pressed:** `none`

## Imagery

粗描边图形、几何贴纸、单色图标。允许把照片处理成高对比双色调后加黑框。不使用柔和摄影、渐变与 emoji 装饰。

## Layout

上限 1200px、容器内边距 24px，区块间距 80px。元素允许 -2 到 3 度旋转，同屏最多四个带旋转的元素。卡片垂直错落 8px。所有内容对齐 8px 网格的倍数，旋转不改变落点。

## Agent Prompt Guide

### Implementation Contract

- 以用户请求中的页面、用户任务和真实内容为依据，只实施指定范围；标明缺失的业务信息，不编造数据或能力。
- 先检查现有项目、技术栈与组件；沿用项目结构、路由和依赖，复用已有组件，不重建未要求的页面或功能。
- 沿用项目断点，调整窄屏与桌面的网格和留白；保留信息层级，避免意外横向溢出。
- 对本次涉及的交互，处理键盘焦点与减少动态效果；补齐适用的禁用、加载、空内容与错误状态。
- 完成后按项目现有脚本检查，仅报告实际运行的测试与视觉检查，并列出未验证项。

QUICK COLOR REFERENCE:

- text: `#000000`
- background: `#ffffff`
- coral: `#ff6b6b`
- mint: `#4ecdc4`
- sunny: `#ffe66d`
- peach: `#f38181`

EXAMPLE COMPONENT PROMPTS:

1. 做一个俏皮野兽派按钮：背景 #ff6b6b、白字、4px solid #000 边框、border-radius 0、900 字重 16px、padding 12px 24px、box-shadow 6px 6px 0 #4ecdc4、transform rotate(-2deg)。hover 时 translateY(-4px) rotate(3deg)、阴影换成 8px 8px 0 #ffe66d；active 时 translate(6px,6px) scale(0.95) rotate(0) 且阴影 none。transition 300ms cubic-bezier(0.34,1.56,0.64,1)。

## Similar Brands

- **Neo-Brutalist** — 同一骨架，但正经版不旋转、阴影只用黑色
- **Memphis** — 同样彩色几何与俏皮，但孟菲斯用图案而非硬阴影

## Quick Start

```css
:root {
  /* Colors */
  --color-ink: #000000;
  --color-white: #ffffff;
  --color-coral: #ff6b6b;
  --color-mint: #4ecdc4;
  --color-sunny: #ffe66d;
  --color-seafoam: #95e1d3;
  --color-peach: #f38181;

  /* Typography — Font Families */
  --font-sans:
    "Inter", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
    sans-serif;

  /* Typography — Scale */
  --text-display: 56px;
  --leading-display: 1;
  --tracking-display: -0.03em;
  --text-heading: 40px;
  --leading-heading: 1.05;
  --tracking-heading: -0.02em;
  --text-subheading: 28px;
  --leading-subheading: 1.15;
  --text-body-lg: 20px;
  --leading-body-lg: 1.4;
  --text-body: 16px;
  --leading-body: 1.55;
  --text-label: 14px;
  --leading-label: 1.35;
  --tracking-label: 0.04em;

  /* Typography — Weights */
  --font-weight-bold: 700;
  --font-weight-black: 900;

  /* Spacing */
  --spacing-unit: 8px;
  --spacing-8: 8px;
  --spacing-16: 16px;
  --spacing-24: 24px;
  --spacing-32: 32px;
  --spacing-48: 48px;
  --spacing-64: 64px;
  --spacing-96: 96px;

  /* Layout */
  --page-max-width: 1200px;
  --section-gap: 80px;
  --card-padding: 28px;
  --element-gap: 20px;
  --density: comfortable;

  /* Border Radius */
  --radius-cards: 0;
  --radius-buttons: 0;
  --radius-inputs: 0;
  --radius-tags: 0;

  /* Surfaces */
  --surface-white: #ffffff;
  --surface-coral-block: #ff6b6b;
}
```
