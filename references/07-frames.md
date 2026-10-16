# 07 · 帧：影片是怎么被拼出来的

你在做一部 beat-locked 动画解说片。影片不是一个文件，是 **N 个子合成文件 + 一个生成出来的 index**。
这一章讲**装配**：一帧到底是什么形状、帧之间靠什么对齐、index 从哪来、共享库怎么用。
逐帧的写作规范在 `templates/BUILD-RULES.md`，闸门在 `08-verification.md`。

---

## 1. 工作单元：一帧 = 一个 templated sub-composition 文件

一帧就是一个 HTML 文件，路径由 storyboard 的 `- src:` 决定（如 `compositions/frames/26-age217.html`）。
它**不是**独立页面：它是被宿主按 `data-composition-src` 拉进来、在自己的局部时间轴上独立 seek 的一个片段。
宿主的装载流程决定了文件形状，没有商量余地：`fetch` 这个 HTML → 用 `DOMParser` 解析 →
**只把 `<template>` 的内容克隆进宿主槽位** → `<template>` 之外的一切，**包括整个 `<head>`**，**被丢弃**。

所以 `<template>` 不是"包装"，是**运输容器**：运行时需要的东西必须全在里面（`<link>`、`<style>`、
标记、`<script>`）。写在 `<head>` 里的 `<style>`/`<script>` 不会报错，只会**静默消失**——
画面变成左上角一行没样式的系统字体小字。

```html
<!doctype html>
<html lang="zh-CN">
  <head><meta charset="UTF-8" /><title>F<NN></title></head>
  <body>
    <template>
      <!--HF_FONTS-->                                  <!-- 构建期替换为内联 @font-face -->
      <link rel="stylesheet" href="../lib/<THEME>.css" />
      <style>/* 只放这一帧的规则 */</style>
      <div id="root" data-composition-id="f<NN>" data-width="1920" data-height="1080" data-duration="<packet 值>">
        ...
      </div>
      <script src="../../assets/lib/gsap.min.js"></script>
      <script src="../lib/<THEME>.js"></script>
      <script>/* HF.register('f<NN>', tl => { ... }) */</script>
    </template>
  </body>
</html>
```

`<title>` 只给人和工具看（head 会被丢掉），但**必须写成纯 ASCII 并且闭合**：`<title>` 是 RCDATA，
一个丢掉 `</title>` 的标题会让解析器把**整个 body 当成标题文本**吞掉，磁盘上的标记看起来却完全正常。
`tools/verify-frames.mjs` 专门查这一条，`tools/fix-titles.mjs` 负责修。

要不要先跑 lint？可以，但 lint 只校验**单个文件**；真正毁掉一次渲染的失败几乎都是**跨文件**且静默的，
所以装配后的第一道闸门是 `tools/verify-frames.mjs`，不是 lint。

---

## 2. 三个 id 必须一致

同一个 id 必须出现在**三个**地方，缺一处就是整片报废：

| # | 位置 | 例子 |
|---|---|---|
| 1 | 宿主槽位（`index.html` 里的 clip）`data-composition-id` | `f26` |
| 2 | 子合成自己的根元素 `data-composition-id` | `f26` |
| 3 | 时间轴注册键 `window.__timelines["<id>"]`（本项目由 `HF.register('<id>', …)` 写入） | `f26` |

规则：id = `f` + 两位帧号（`f01`…`f33`）。文件名里的 `NN-` 前缀只用于排序，**不是** id。

**不一致的后果（真实故障模式）**：宿主的 `data-composition-id` 是框架查找时间轴的 key。三处不一致时，
运行时日志会为每个场景打印 `Sub-composition timelines not registered after 45000ms: <id>`，
**每个场景等 45 秒**，然后捕获**静态首帧**——成片长度完整、一点不报错、画面全死。
33 帧的话就是二十多分钟白等加一部死片。`verify-frames.mjs` 把这条做成硬断言：根属性必须是期望 id、
`HF.register('<id>'` 必须存在、文件里不能出现**第二个**不同的 composition id。

---

## 3. 一个 composition 一条 paused 时间轴

每个 composition 在 `window.__timelines["<id>"]` 上注册**恰好一条** `gsap.timeline({ paused: true })`。
本项目的写法是 `HF.register(id, build)`：它**先建时间轴、再执行 build、最后才注册**——
注册必须发生在构建完成之后，否则运行时拿到的是半成品时间轴。

- 渲染长度来自根的 `data-duration`，**不是**时间轴长度：时间轴超出会被切断，提前结束则**保持末帧**。
  所以不需要用空 tween 去补时长。
- 手动加进根时间轴的 scene 时间轴**自己不能是 paused**：paused 的子时间轴在被 seek 时不会前进。
- 不要手动把子合成时间轴 `add()` 进宿主：运行时已经独立驱动它们，嵌套会导致双重 seek。
- 进入动画一律用 `gsap.fromTo()`，不要用 `gsap.from()`。宿主每次让 clip 可见都会重新 seek 这个子合成；
  `from()` 在注册时记录起始状态，seek 回来会错位。`fromTo()` 两端都写死，重放才干净。

---

## 4. packet：帧构建者的简报

`tools/build-frame-packets.mjs` 为每一帧生成 `.hyperframes/packets/FNN.md`——
**一个帧构建者需要的一切，其他什么都不给**。它从 `audio/cue-map.json`、`audio/timing-map.json`、
`data/*.json` 和 `STORYBOARD.md` 拼出来，各部分存在的理由：

| 段落 | 内容 | 为什么必须有 |
|---|---|---|
| 故事板块 | `scene` / `shot` / `bars` / `voiceover` / `display` / `data` | 视觉想法**已经定了**，构建者实现它，不替换成自己的概念 |
| Timing | film window、`data-duration`、`T0`/`at()`、逐条字幕的 **local** 时间 | 唯一的权威时间来源；手写时间必然漂移 |
| Musical grid | 本帧内的 beats / bar lines（local 秒） | 重音落点必须是这些值之一 |
| Data appendix | 只列出**本帧允许打印**的数值，逐字 | 画面上的数字必须有出处，不许重算、不许换舍入 |
| Deliverable | 唯一的输出路径 + 骨架 | 一帧一文件，形状是承载性的 |

### 绝对时间 → 帧内时间：唯一一个"错了也看不出来"的坑

子合成的时钟从 **0** 开始，而 storyboard / cue map 全部写在**影片的绝对时钟**上。
packet 因此给出换算器和换算后的值（F26 的真实内容）：

```text
- film window: 127.952 -> 132.203 s   (duration **4.251s**)
- root attribute: `data-duration="4.251"`
- offset: `const T0 = 127.952; const at = (abs) => Math.max(0, abs - T0);`
- cue 1: `37% 的观察期，在 21.7 岁结束。`
  - film 128.48-132.02s  ->  **local 0.528 -> 4.068s** (3.54s on screen)
- beats (local s): 0, 0.532, 1.063, 1.595, 2.126, 2.657, 3.189, 3.72
- bar lines (local s): 0, 2.126
```

**只可以用 local 值。** 把 128.48 直接写进 tween 的后果不是报错：字幕迟到 128 秒，
等于整帧没有字幕，而成片长度、卡点校验、lint 全部照常通过——最坏的一类 bug。帧内 local 0 按构造就是一条小节线。

---

## 5. 并行派发

帧之间没有依赖，所以**一次并行派发多帧，一帧一个构建者**。给每个构建者的输入是固定五件，不要多给：

1. **构建契约** `templates/BUILD-RULES.md`（本片的实例是 `.hyperframes/BUILD-RULES.md`）
2. **它自己的 packet** `.hyperframes/packets/FNN.md`
3. **设计规范** `frame.md`（色板、字体语域、保留带、禁用项）
4. **共享库** `compositions/lib/<THEME>.css` + `<THEME>.js`（先读，再动手）
5. **参考帧** `compositions/frames/01-question.html`（结构、注释、工艺水平的模板）

派发时同时给三条行为约束：

| 约束 | 内容 | 理由 |
|---|---|---|
| 只写自己的文件 | 不碰 `<THEME>.css` / `<THEME>.js` / 设计规范 / storyboard / `index.html` / 其他帧 | 并行写共享文件会互相覆盖 |
| 不跑渲染器 | 不执行 `npx hyperframes lint/check/snapshot/render` | CLI 串行化很差，33 个进程互相拖死；校验由编排者集中跑 |
| 回报重音 | 写 `.hyperframes/accents/FNN.json`（机器可读） | 声音设计要按帧对齐（见下） |

`accents/FNN.json` 的形状（`localS` 是**帧内**秒，3 位小数；`on` 只能是 `bar` 或 `beat`）：

```json
{
  "frame": 26,
  "compositionId": "f26",
  "durationS": 4.251,
  "accents": [
    { "localS": 0.0,   "on": "bar",  "what": "分割线从轴左端起步" },
    { "localS": 2.656, "on": "beat", "what": "金框 21.7 弹出" }
  ]
}
```

每个**显示重音**一条：入场、撞击、数字揭示、金色点亮。**字幕不写进去**（它们已经在 packet 里）。
`verify-frames.mjs` 只把它当"对齐辅助"报告，缺失不算失败——但缺了它，音效只能靠共享拍网格盲配。

---

## 6. 帧与帧之间的连续性

相邻两帧必须**共用同一个舞台**：同样的几何、同样的地面、同样的光。否则那个 cut 读起来像换了部片子——
观众说不出哪里不对，只会觉得"碎了"。

真实做法：在**并行开始之前**先定死一套舞台约定，写进契约，所有构建者抄同一份：

- 共用轴线/基线：律动元素落在哪条 y、从哪条 x 出发；
- 共用地面：`HF.ground(root, {...})`、同一套光池参数如何按场景移动仍是**一个**光源；
- 共用保留带：显示带 / 间隙带 / 字幕带的边界（见 `BUILD-RULES.md` 的框架规则 7）。

**真实踩过的坑**：某一帧的邻居还没被构建出来，构建者手上没有可对齐的对象，
于是两位构建者各自发明了一套几何（轴线位置、光的落点都不同），
两条相邻的镜头看起来不像同一部片。修法不是"再做一版"——是把舞台约定**提前**写进契约里，
让"邻居不存在"这件事不再影响几何决策。

---

## 7. index 是生成物，永远不要手改

`tools/build-index.mjs` 从 storyboard + `audio/cue-map.json` 生成 `index.html`。
切点只能通过重跑 `tools/sync-storyboard-timings.mjs` 移动。它做四件事：

1. **先把字体注进去**：调用 `tools/inject-fonts.mjs`。帧是并行陆续到达的，
   在上一轮字体注入之后才落地的帧会没有 `@font-face`，lint 立刻以
   `font_family_without_font_face` 失败——所以 index 构建永远先重注入一遍。
2. **只挂已经存在的帧**：逐帧查 `- src:` 和文件是否在磁盘上；缺的**报告并跳过**，
   项目在建设过程中始终可渲染。开始时 `1/33`，收尾时 `33/33`。
3. **写宿主 clip**：`id` / `data-composition-id` / `data-composition-src` / `data-start` / `data-duration`
   / `data-track-index` / `data-width` / `data-height`。`data-start` 取自 cue map（3 位小数），
   与子合成根上的 `data-duration` 必须相等——这正是 `verify-frames.mjs` 的第二条断言。
4. **只挂一条预混母带**：整片 BGM + 所有音效已经混成 `assets/audio/mix.wav`（见 `tools/mix-soundtrack.mjs`），
   index 里只是一个 `<audio id="soundtrack" src="…" data-start="0" data-duration="<片长>">`。
   **`<audio>` 必须有 id**：没有 id 的 audio 不会被混音器拾取，成片直接静音。

根元素带 `data-no-timeline`，因为它**没有**自己的 GSAP 时间轴：index 只是 33 个槽位 + 一条音轨，
每条子合成自己带时间轴，由运行时自动嵌套。给根注册一条空时间轴只会多一个 seek 源。

---

## 8. 共享库，而不是复制粘贴

每帧都 `<link>` 同一份 `<THEME>.css`、`<script src>` 同一份 `<THEME>.js`：

| 文件 | 提供 |
|---|---|
| `<THEME>.css` | 色板 tokens、**一个**光池（`--pool-*`）、保留带（`.band-sub` / `.band-display` / `.band-chrome`）、字体语域（`.t-display` / `.t-figure` / `.t-label` …）、1px hairline、`.card` / `.chip` / `.dust` 等微组件 |
| `<THEME>.js`（挂在 `window.HF`） | `HF.ground(root, opts)`、`HF.ear`、`HF.field`、`HF.dust`、`HF.dotAxis`、`HF.timelineBar`、`HF.figure`、`HF.hand`、`HF.rng(seed)`、`HF.register(id, build)` |

**规则：构建者调用共享图形，不许重画。** 全片只有**一支**麦穗、**一只手**、**一个人形**——
如果每帧各画一遍，观众看到的是 33 种不同的麦子，片子的"一个世界"就没了。
数字与图形同理：轴、时间条、点阵都来自 `HF.*`，因此跨帧可比较。

`HF.ground` 顺带固定了图层顺序：地面插到 `#root` 的**第一个子节点**（在所有已有内容之后），
光线在它之上，尘埃浮在主体**前面**。所以帧自己不用再想层级；也正因如此，
`#root` 的第一个子元素是 `.ground`，**不是**你写的那层包裹——见 `BUILD-RULES.md` 的规则 D。

新增共享能力时：**只做加法**。往 `<THEME>.css`/`.js` 里**追加**新的 token、组件或构造函数，
不改名、不改既有签名、不换既有数值——并行中的 33 帧会同时被影响。
