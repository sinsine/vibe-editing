# 逐帧构建契约（模板）——动手前请读完整个文件

你在构建 **一部 <DURATION> 的 beat-locked 动画解说片中的一帧**：<ONE_LINE_PREMISE>。
全片共 <N> 帧，**你只做一帧**，其他帧正在被别的构建者并行构建。

> 本文件是**主题无关**的模板。尖括号 `<...>` 是占位符，必须由本次项目的设计规范 / packet 填实。
> 不要保留任何占位符原文，也不要把本模板里没有的值凭想象补上。

| 占位符 | 从哪里取 |
|---|---|
| `<PROJ>` | 项目目录，如 `videos/<slug>` |
| `<NN>` / `f<NN>` | 你的帧号（两位）与 composition id |
| `<DURATION>` | packet 的 `data-duration`（= 该帧在片中的槽位长度） |
| `<THEME>` | 共享库文件名，如 `wheat` → `<THEME>.css` / `<THEME>.js` |
| `<CANVAS_W>` / `<CANVAS_H>` | 画布尺寸（本模板默认 1920×1080） |
| `<DISPLAY_BAND>` / `<GAP_BAND>` / `<SUBTITLE_BAND>` / `<CHROME_BAND>` | **设计规范**里的保留带 y 值，逐像素照抄 |
| `--<ACCENT>-*` / `--<COUNTER>-*` | 设计规范的两条色域及其**语义**（哪条表示"被选/现在"，哪条表示"未观察/已错过"） |
| `<FONT_A>`…`<FONT_F>` | 设计规范允许的字体家族白名单（只许用这些，见规则 17） |
| `<SUBTITLE_CLASS>` | 字幕元素类名，如 `.subtitle` |
| `<DATA_FILES>` | packet 的数据附录里列出的数据文件 |

## 先读，按这个顺序

1. **`<PROJ>/.hyperframes/packets/F<NN>.md`** —— 你这一帧：文案、**已经换算到帧内时钟**的时间、允许打印的数据。
2. **`<PROJ>/frame.md`**（设计规范）—— 色板、字体语域、保留带、禁用项。不可协商。
3. **`<PROJ>/compositions/lib/<THEME>.css`** —— 共享 tokens 与组件。
4. **`<PROJ>/compositions/lib/<THEME>.js`** —— 共享图形构造器（`HF.ground` / `HF.ear` / `HF.field` /
   `HF.dust` / `HF.dotAxis` / `HF.timelineBar` / `HF.figure` / `HF.hand` / `HF.rng` / `HF.register`；
   以你项目里真实导出的为准）。**用它们，不要重画。**
5. **参考帧**（packet 指定，或 `<PROJ>/compositions/frames/01-*.html`）—— 结构、注释密度、工艺水平。
   你的帧应当看起来出自同一只手。

---

## 硬规则（违反任一条会破坏渲染或画面）

**A. 大字号需要"墨"的空间。** 汉字在大字号下的墨迹比它的行盒更高：`font-size: 132px` + `line-height: 1`
会溢出容器约 7px，邻行更高时能溢出 60px+。`check` 报 `text_box_overflow`，这是真实的裁切风险。
显示行给 `line-height` ≥ 1.18 **并且**留 padding，或把容器做成量出来的墨迹高度。
如果字形是**故意**超出装饰框，给那个框标 `data-layout-allow-overflow`。

**B. 文字不得被遮挡。** `check` 用 `text_occluded` 报告一个文字元素压在另一个下面。
每个文字块给一块自己的区域：不要在同一位置叠两个文字元素，
也不要让后面的元素（分隔线、细线、面板）横穿一个活的文字块。
确实是刻意且无害的分层，标 `data-layout-allow-occlusion`——但绝大多数情况下答案是"挪开"。

**C. 故意被裁的图层要声明。** 滚动的地面、跑马灯、粒子层是**故意**超出它的裁切容器的：
给那个容器标 `data-layout-allow-overflow`，否则会报 `container_overflow`。只在你**要**这个溢出时才用。

**D. 不要 tween 一个不是你自己创建的 selector。** `gsap.to('#f<NN>-ground .pool')` 在 `.pool` 属于别处时
会警告 `GSAP target not found`；由未定义变量拼出来的 selector 会变成空字符串，警告同样。
优先使用你在本文件里创建的 id，别的什么都不要 log。
**陷阱**：`HF.ground(root, …)` 把地面插成 `#root` 的**第一个子节点**——所以 `.pool` 是 `#root` 的子元素，
不是你自己的包裹层的子元素。

**E. 同一元素同一属性上的两对 `fromTo`：后一对必须加 `immediateRender: false`。**
GSAP 在构建 tween 的那一刻就渲染 `fromTo` 的 "from" 状态，于是有两对时，帧会**开场就持有后一步的状态**
而不是它真正的开场姿态——真实案例：滚动条开局就前进了 380px，字幕从第 0 帧就可见。
要么给后出现的每一对都加 `immediateRender: false`，要么用一次 `gsap.set()` 定初值、之后只用 `.to()`。

**F. 不要把"带小数的 px 字符串"当作 tween 的长度值。** `width: '326.80px'` 会从大约 10 倍的值开始插值。
用纯数字（`width: 326.8`）或改动画 transform（`scaleX`、`x`），它们的量取是精确的。

---

## 框架规则（编号）

1. **Templated 子合成。** 一切都放在 `<template>` 里。`<head>` 里只允许 `<meta charset>` 和 `<title>`——
   `<head>` 里的 `<style>` / `<script>` 会被运行时**静默丢弃**（`<template>` 是运输容器，
   `<template>` 之外的一切在挂载时都不存在）。`<title>` 写成纯 ASCII 且**必须闭合**：
   `<title>` 是 RCDATA，未闭合会把整个 body 吞成标题文本。
2. **根元素**：`<div id="root" data-composition-id="f<NN>" data-width="<CANVAS_W>" data-height="<CANVAS_H>"
   data-duration="<DURATION>">`。用 `#root` 选择器给它样式，**不要**用 class。
   用 `width/height: 100%`（或 `inset: 0`），不要写死 `<CANVAS_W>px`。
3. **composition id 必须在三处一致**：根属性、`HF.register('f<NN>', …)`（= `window.__timelines["f<NN>"]`）、
   宿主 `index.html` 的槽位。不一致的后果是运行时每场景等 45 秒后捕获静态首帧。
4. 把字面量 `<!--HF_FONTS-->` 放在 `<template>` 的第一个子节点位置：构建步骤会把它替换成内联
   `@font-face` 块（渲染器只扫描内联块，`<link>` 进来的字体它看不见）。**不要**自己写 `@font-face`。
5. 然后 `<link rel="stylesheet" href="../lib/<THEME>.css" />`，再是你的帧级 `<style>`。
6. 脚本放在 template 末尾，顺序固定：本地 gsap → `../lib/<THEME>.js` → 你的内联 `<script>`。
   **不要**用 CDN（渲染期不许联网）。
7. **永远不要用 `vw`/`vh`。** 用 `cqw`/`cqh` 或 px；`#root` 已经设了 `container-type: size`。
8. **保留带是法律**（值从设计规范逐像素照抄）：显示字、图形、图表住在 **<DISPLAY_BAND>**；
   **<SUBTITLE_BAND>** 只放 `<SUBTITLE_CLASS>` 字幕内容；**<GAP_BAND>** 必须保持无内容；
   标签/chrome 放在 **<CHROME_BAND>**。
9. **字幕**：每条 cue 一个带 `<SUBTITLE_CLASS>` 的元素，时间用 packet 的 **LOCAL** 值。
   用 GSAP 淡入/位移；一条 cue 结束前把它移出。**永远不要**把显示字放进字幕带。
10. **每个重音都要落在 packet「Musical grid」里的一条拍线上**：显示入场、撞击、数字揭示、
    金色亮起的瞬间。本帧的 local 0 按构造就是一条小节线。
11. 入场一律用 `gsap.fromTo()`，**不要** `gsap.from()`——宿主会重新 seek 这个子合成，
    `from()` 在 seek 回来时会失同步。
12. **不要**对带 `.clip` 的元素 tween `display` / `visibility` / `autoAlpha`：动画它的子元素。
13. **不要**在之后要用 `x`/`y`/`scale` tween 的元素上写初始 CSS `transform`——
    起始状态写在 `fromTo` 里。
14. **确定性**：没有 `Math.random()`、没有 `Date.now()`、没有网络请求、没有 `repeat: -1`。
    所有"看起来随机"的值走 `HF.rng(seed)`。
15. 每个有时间意义的可视元素都要有 `data-start`、`data-duration`、`class="clip"`
    **以及**一个稳定 `id`（缺 id 会被 lint 警告）。
16. **色彩语域是语义，不是装饰。** `--<ACCENT>-*` = 被选 / 点亮 / 现在 / 你；
    `--<COUNTER>-*` = 未观察 / 已错过 / 尚未。**没有第三种色相**——不要用红色表示"错"、
    不要用绿色表示"对"。同一语域内的强调靠**大小、字重、不透明度**。
17. **字体**：只用设计规范里的白名单 `<FONT_A>`…`<FONT_F>`。**永远不要**写系统字体名
    （Arial、微软雅黑、Noto Sans SC…）：lint 会拒绝，成片会掉字体。也不要用 `font-weight: 900`
    去"合成"一个本来没有的粗体——用真实存在的字重家族名。
18. **不要打印 packet 或数据附录里没有的数字。** 永远不要臆造一个数值。
    引用型数字必须带它的出处标签（见 packet 的 citation 规则），
    每个数字都要能追到 `<DATA_FILES>` 里的某个文件。
19. **只改你自己的输出文件。** 不要碰 `<THEME>.css` / `<THEME>.js` / `frame.md` /
    `STORYBOARD.md` / `index.html` / 其他任何帧文件。要加共享能力就**只做加法**并说明。
20. **不要运行 `npx hyperframes`**（lint / check / snapshot / render 都不要）。
    其他构建者正在并行跑，CLI 串行化很差；校验由**编排者集中**执行。

---

## 工艺底线（这决定它好不好，而不只是合不合法）

- **一帧一个光源。** 设好 `--pool-x/--pool-y/--pool-w/--pool-h/--pool-strength` 并调用
  `HF.ground(root, {...})`。光池是本帧的主光；每一个辉光、每一道光柱都要和它一致。
- **一个显示瞬间**压倒其他一切，量级 3–6×。没有任何东西与它竞争。
- **陈述型帧保持约 50% 空。** 忍住别填满——空，是这部片子的自信。
- **运动要铺满整帧**，不要前置然后冻住：入场 → 中段在更晚的小节线上有一次发展 →
    一次收束。在第一秒里就动完的帧是浪费的帧。
- **光是唯一的纵深手段**：bloom（`0 0 24px var(--glow-warm)`）、光池、≤3 道模糊光柱、
    尘埃（`HF.dust`）、一次金属扫光。不要阴影抬升，不要圆角卡片。
- 细线永远 1px。圆角永远 0（正圆除外）。
- 读 packet 的 `scene:` 与 `display:` 两行——**视觉想法已经决定了**。实现它，不要换成你自己的概念。

---

## 回报（≤120 词）+ 写一个 accents 文件

除了你的帧，写**一个 JSON 文件**：`<PROJ>/.hyperframes/accents/F<NN>.json`
（目录不存在就创建）。编排者用它把声音设计和你的画面精确对上，所以它必须列出**你真实用过的时间**：

```json
{
  "frame": <NN>,
  "compositionId": "f<NN>",
  "durationS": <DURATION>,
  "accents": [
    { "localS": 0.0,   "on": "bar",  "text": false, "what": "<图形入场>" },
    { "localS": 2.656, "on": "beat", "text": true,  "what": "<大字落版>" }
  ]
}
```

- `localS` 是**帧内**秒（和你的时间轴同一时钟），3 位小数。
- `on` 只能是 `"bar"` 或 `"beat"`：它坐在哪条网格线上。
- **`text` 必须写**：这条重音是否把**大字区（y 140–842）的文字**放上屏幕。
  图形入场、光效、轴展开都是 `false`；术语落版、数字揭示、标题打出是 `true`。
  这一个布尔值是 `tools/coverage-map.mjs` 唯一能**精确**判断"这帧是不是坏了"的依据——
  没有它，一个真的坏帧（字被 mask 掉、整段不可见）和一个正常的三秒铺垫在像素上
  完全一样：参考影片里，只靠像素的版本报了 9 帧，其中 8 帧是设计好的铺垫。
- 每个**显示重音**一条：入场、撞击、数字揭示、点亮。**字幕不写进去**（它们已经在 packet 里）。

然后回报（≤120 词）：帧文件路径、一句话说明这帧展示了什么、重音时间，
以及**任何你没能做到的、或不得不假设的东西**。
