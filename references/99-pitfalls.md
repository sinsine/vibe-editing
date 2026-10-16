# 99 · 真实失败目录（Pitfalls）

## 如何使用本文

**在动手写第一个 HTML 之前读完它，并在任何东西"行为古怪"时回来重读。** 这里的 34 条不是"注意事项"，是一部 161 秒、33 帧的成片在构建过程中真实踩过的坑——每一条都写清了症状、根因、修法和**用哪个脚本能自动发现它**。这些失败的共同点是**静默**：
`lint` 说没问题，`check` 说没问题，磁盘上的文件看起来也没问题，但渲染出来是黑帧、静止帧、无声、无样式，或者动画根本没跑。下文提到的检查脚本在本 skill 里是 `scripts/*.mjs`（源工程里同名同内容，放在 `tools/`）；跑法一律是
`node scripts/<name>.mjs`。涉及 `npx hyperframes …` 的命令（`lint` / `check` / `snapshot` / `preview` / `doctor`）都是框架自带命令，不要自己发明替代品。

**一条总原则：先让机器查，再让人眼判。** 每个静默失效都配得上一道闸门；没有闸门的地方，就把结论写进交付说明，而不是假装通过。

## 快速索引表

| # | 一句话症状 | 自动发现手段 |
|---|---|---|
| 1 | 整帧渲染失效，磁盘标记却完全正常 | `scripts/verify-frames.mjs`（`<title>…</title>` 同行闭合）+ `scripts/fix-titles.mjs` |
| 2 | 帧开场就停在后面某一步的状态（滚动层领先 380px、字幕第 0 帧已现） | `scripts/frame-openings.mjs`（切点后 60ms 取样） |
| 3 | 视频长度正常但完全不动（每场景等 45s 超时后截静态首帧） | `scripts/verify-frames.mjs` 第 1 步 + lint `missing_data_no_timeline` |
| 4 | 成品无声，且不报错 | lint `media_missing_id`；`scripts/build-index.mjs` 的固定模板 |
| 5 | 检查全过，渲染成左上角一堆无样式小字 | `scripts/verify-frames.mjs` 第 4 步 + `scripts/audit-still.mjs` `topLeftEdge > 6` |
| 6 | lint `font_family_without_font_face`，或编译器警告无确定性字体映射 | `scripts/verify-frames.mjs` 第 3 步 + lint |
| 7 | 新帧带着未替换的 `<!--HF_FONTS-->` 进了 index，没有字体声明 | `scripts/verify-frames.mjs`（unreplaced token / 块数） |
| 8 | `check` 报 `text_box_overflow`，中文单字超出容器 7–62px | `npx hyperframes check` 的 `text_box_overflow`（读 `overflow.bottom`） |
| 9 | `check` 报 `text_occluded` / `content_overlap` | `npx hyperframes check`（读 `coveredFraction`） |
| 10 | `check` 报 `container_overflow` / `escaped_container`，但溢出就是效果 | `npx hyperframes check`；`data-layout-allow-overflow` |
| 11 | 非全屏预览时版面被放大 | `scripts/verify-frames.mjs` 第 5 步（vw/vh 正则） |
| 12 | lint `gsap_animates_clip_element` | `npx hyperframes lint` |
| 13 | lint `gsap_css_transform_conflict` | `npx hyperframes lint` |
| 14 | `width: '326.80px'` 从约 10 倍处开始插值 | 静态正则扫十进制 px 字符串；后果由 `check` 暴露 |
| 15 | 深色内容落到黑色/白色 body 上，看不见 | `scripts/audit-still.mjs`（`meanLuma`/`litFrac`）+ `check` `sweep_static` |
| 16 | `GSAP target … not found`，动画静默失效 | `check` 的 runtime `console_warning`（带 line/time） |
| 17 | `GSAP target  not found`（target 是空的） | 同上；`check --strict` 可作闸门 |
| 18 | 自相关给出 64.6 BPM，真值 112.91 BPM | `scripts/hit-map.mjs` + `scripts/timing-map.mjs`（看 `gridFit`） |
| 19 | 节奏一改，手写的 cue 时间全部失准 | `scripts/sync-storyboard-timings.mjs --check` + `scripts/verify-timing.mjs` |
| 20 | 两条重叠 cue，一条 0.88s 短 cue | `--check` 报告 + `check` 的 `content_overlap` |
| 21 | 字幕读不完（>6.5 字/秒）或一闪而过（<1.2s） | `scripts/sync-storyboard-timings.mjs` 的 `too fast` / `too short` |
| 22 | 音效落到该帧结束之后 | `scripts/build-sfx-map.mjs` 越界断言 + `scripts/verify-timing.mjs` 第 3/4 项 |
| 23 | 麦田被判成"字幕提前出现" | `scripts/frame-openings.mjs` 的 `TEXT_LUMA = 150` |
| 24 | `check_runtime_failure: Check did not finish within its deadline.` | `check --json` 的 `runtime.findings[].code`；用 `--samples 3` |
| 25 | `0 issue(s) across 0 sample(s)`、`0/0 text checks` 看起来像通过 | `check --json` 的 `browserSkipped` 与 `lint.errorCount` |
| 26 | npm 能装包，`skills update` / `init` 的 git clone 却失败 | `git -c http.proxy= -c https.proxy= ls-remote <url>`；`npx hyperframes doctor --json` |
| 27 | winget 装完 FFmpeg，当前 shell 里还是没有 | `. scripts\env.ps1` + `npx hyperframes doctor --json` |
| 28 | `.ps1` 里出现中文路径，引号解析崩掉 | `Select-String -Pattern '[^\x00-\x7F]'` 扫非 ASCII |
| 29 | 响度/峰值测量结果一片 `null` | `node scripts/mix-soundtrack.mjs --measure`（改用 `spawnSync` 读 stderr） |
| 30 | 检查通过、渲染缺图/缺字体 | `scripts/verify-frames.mjs` 第 3/4 步（引用与字体块） |
| 31 | 交付说明把第三方素材笼统写成 "CC0" | `audio/sfx-licenses.json` 台账条数 vs 实际文件数 |
| 32 | 40 条音效里部分无法独立定位，却被算作"通过" | `scripts/verify-timing.mjs` 第 4 项（`ambiguous` 单列） |
| 33 | 为消掉一条 2.9:1 警告去改设计 | `check --json` 的 `contrast.findings[].times` + `checked/passed` |
| 34 | "检查通过"被当成"好看" | 没有脚本能发现；只能 `npx hyperframes snapshot` 出接触表交给人 |
| 35 | **成片交付后才发现某一帧连续 5 秒是空的**（遮罩 + 淡透明叠加把字彻底抹掉） | `scripts/coverage-map.mjs --every 1.0`（前提：该帧 accents 里给文字标了 `"text": true`） |

---

## A. 会让整帧或整个渲染静默失效的

### 1. `<title>` 没有闭合的 `</title>`

- **症状**：F11 整帧失效——`lint` 认为这一帧没有 root、`<template>` 里没有内容，但磁盘上的标记完全正常，肉眼看不出任何问题。
- **根因**：标题里一个乱码字节吃掉了 `<`，`</title>` 丢失。`<title>` 是 **RCDATA**，解析器把**整个 body** 当标题文本，一个元素都不解析。**任何基于文本的结构检查都看不出这件事**，因为文本本身是"合法"的 HTML。
- **修法**：标题保持纯 ASCII；`node scripts/fix-titles.mjs --write` 会把它规范化成 `<title>F11</title>`（无参数时只报告）。
- **怎么自动发现它**：`scripts/verify-frames.mjs` 第 6b 步——取含 `<title>` 的那一行，断言 `<title>…</title>` 在**同一行**闭合，否则报 `unterminated <title> (RCDATA swallows the body — run tools/fix-titles.mjs)`。`scripts/fix-titles.mjs`
另外扫 `\uFFFD` 和常见 mojibake 串（`鎵`/`鐨`/`鏄`）。

```html
<!-- 坏：那个 < 被吃掉了，整个 body 变成标题文本 -->
<title>F11 手里是空的</title
<!-- 好：纯 ASCII，闭合在同一行 -->
<title>F11</title>
```

### 2. 同一个元素的同一属性写了两组 `fromTo`

- **症状**：帧**开场就停在后面某一步的状态**。真实症状：F09 的滚动层 `#f09-near` 开场就领先 **380px**（`{ x: -380 }`），字幕从第 0 帧起就可见。
- **根因**：GSAP 的 `immediateRender` 默认 `true`，`fromTo` 在**建表时**（不是播放到该位置时）就渲染后一次的 "from"，于是把开场姿态改写成后来的状态。同一元素同一属性出现第二组 `fromTo`，开场姿态就被第二组覆盖。
- **修法**：后一组加 `immediateRender: false`；或者用 `gsap.set()` 定一次初始态 + 之后只用 `.to()`。F09 把它做成参数：`walked(from, to, at, dur, first)` 内 `const hold = { duration: dur, ease: 'power1.in', immediateRender: !!first }`，
一组里只有第一段允许 `immediateRender`。F16 的 `#f16-ring` `scale` 第二组也显式注释了原因：没有 `immediateRender: false` 帧就会以满 scale 开场，而不是它的 0.5 落地姿态。
- **怎么自动发现它**：`scripts/frame-openings.mjs` —— 在**每个切点后 60 ms**（`PROBE = 0.06`）取样，若字幕带墨迹 > `INK_LIMIT = 0.25`% 而该帧首条 cue 还没到（`firstCueLocal > DUE_SLACK = 0.25`）即报警。相邻线索：`check` 的 `gsap_tween_tail`
（f10 的 `#f10-edge-glow` opacity 尾巴 3.968s 压过 3.940s 的后一组，前者的结束值会留在屏上）。

```js
// 坏：第二组 fromTo 在建表时就把 x 拉到 -380
tl.fromTo('#f09-near', { x: 0 },    { x: -380,  duration: B4, ease: 'none' }, 0);
tl.fromTo('#f09-near', { x: -380 }, { x: -1040, duration: END - B4, ease: 'power1.in' }, B4);
// 好：后一组声明它不要在建表时渲染
tl.fromTo('#f09-near', { x: -380 }, { x: -1040, duration: END - B4, ease: 'power1.in',
  immediateRender: false }, B4);
```

### 3. 合成 id 三处不一致

- **症状**：视频**长度正常但完全不动**——运行时每个场景等 **45 秒**才超时，然后截取静态首帧，于是 161 秒 / 33 场景成片全是静帧。
- **根因**：host 的 `data-composition-id`、子合成内部 root 的 `data-composition-id`、`window.__timelines["<id>"]`（本片用 `HF.register('fNN', …)`）必须**完全相同**。不一致时汇编器回退到"文件里第一个 root"，静默；而 timeline
注册在这三个名字之外，运行时永远等不到它。
- **修法**：三处同一个 `fNN`，改一处就三处一起改。lint 的警告原文已经把代价写清楚了：*"The producer polls for timeline registration for up to 45 seconds before timing out, adding 45 s to every render."*
- **怎么自动发现它**：`scripts/verify-frames.mjs` 第 1 步——root 的 `data-composition-id` 必须等于 `fNN`、必须能匹配 `HF.register('fNN'`、整个文件里 `data-composition-id` 只能有一个唯一值。辅助：lint `missing_timeline_registry`（error）与
`missing_data_no_timeline`（warning）。

### 4. `<audio>` 没有 `id`

- **症状**：成品**完全无声**，而且不报错。画面全对，声轨是空的。
- **根因**：混音器按 id 收集媒体，没有 id 的 `<audio>` 永远不会被拾取。
- **修法**：给每一个 `<audio>` 明确的 id 与时间窗，例如 `scripts/build-index.mjs` 生成的那一条：`<audio id="soundtrack" src="assets/audio/mix.wav" data-start="0" data-duration="161.017" data-track-index="90" data-volume="1">`。
该脚本的模板注释就写着"`<audio>` MUST have an id or the mixer silently drops it"——**手写 index.html 就失去了这层保护**。
- **怎么自动发现它**：`npx hyperframes lint` 的 `media_missing_id`（error，无豁免）。渲染后核对成片响度（见第 29 条）——一声不响的成片在 `--measure` 里会立刻现形。

### 5. 子合成的 `<style>` / `<script>` 放在 `<head>`

- **症状**：**一切检查通过，但渲染出来是左上角一堆无样式小字**。
- **根因**：对**模板化**的子合成，汇编器会丢掉文件自己的 `<head>`（`compositionAssembly.ts` 的 `hasTemplate` gate），运行时只克隆 `<template>` 的内容。`<head>` 里的 `<style>`/`<script>` 被静默丢弃；`<link>` 两种情况都会被提升。
- **修法**：所有 `<style>` 与 `<script>` 放进 `<template>`；`<head>` 只留 `<meta charset>` 和 `<title>`。脚本顺序固定：`../../assets/lib/gsap.min.js` → `../lib/wheat.js` → 你的内联脚本。
- **怎么自动发现它**：`scripts/verify-frames.mjs` 第 4 步（`<style> found in <head> — it will be discarded at mount`、`no <template> wrapper`、缺 `../lib/wheat.css` / gsap / wheat.js 引用）；像素侧的兜底是 `scripts/audit-still.mjs` 的
`topLeftEdge > 6`，它的原文判定就是 *"heavy detail top-left — possible unstyled content"*。

### 6. 命名了字体族却没有文件内的 `@font-face`

- **症状**：lint 报 `font_family_without_font_face`；更隐蔽的是编译器警告 `No deterministic font mapping for: WheatDisplay`，**无法保证截图前字体已加载**——成片可能落到系统字体或根本不出字。
- **根因**：渲染器的编译器**扫描 composition HTML 文件内部**的 `@font-face` 来建确定性字体映射。放在**外链 CSS 里它看不见**。
- **修法**：把 `@font-face` **内联进每一帧**，用 `scripts/inject-fonts.mjs` 注入，**别手写**。路径按子合成文件写 `../../assets/fonts/…`，汇编器会改写。占位符就是字面量 `<!--HF_FONTS-->`，必须是 `<template>` 的第一个子节点。
- **怎么自动发现它**：`scripts/verify-frames.mjs` 第 3 步——每帧必须有**恰好 6 个** `@font-face` 块，且不能残留 `<!--HF_FONTS-->`；加上 lint 的 `font_family_without_font_face`（真实 artifact `edc4e3e5` 里出现过），以及 lint 输出里的
`No deterministic font mapping for: …`。

### 7. 一帧落地晚于字体注入那一步

- **症状**：并行构建时，新帧带着**未替换的 `<!--HF_FONTS-->` 占位符**就进了 index，于是这一帧没有字体声明。
- **根因**：字体注入如果是一次性独立步骤，就与"帧陆续落地"这件事脱钩；迟到的那一帧谁也管不着。
- **修法**：把字体注入**并进 index 生成脚本**：`scripts/build-index.mjs` 一开头就 `execFileSync(process.execPath, ['scripts/inject-fonts.mjs'])`，**每次生成都先注入**；`inject-fonts.mjs` 本身幂等（已有块会被替换而不是叠加）。
- **怎么自动发现它**：`scripts/verify-frames.mjs` 的 `unreplaced <!--HF_FONTS--> token` 与 `expected 6 @font-face blocks, found N (run tools/inject-fonts.mjs)`——每次改帧、每次重建 index 之后都要跑。

---

## B. 版面与「遮挡」类

### 8. 中文字形的墨迹比它的行框高

- **症状**：`check` 报 `text_box_overflow`。F05 实测：`font-size: 132px` + `line-height: 1` 时单字墨迹 **132.67 × 139.92 px**，放进 133×132 的盒子里就 `overflow.bottom: 7.46`（报告写作 *"overflows by up to 7px"*）；同一行里更高的字
（同字号）溢出 **61.85px**（*"up to 62px"*）。
- **根因**：CJK 字形的墨迹比它的行框高，`line-height` 不约束墨迹。用来做逐字揭示的 `overflow: hidden` 会**切到笔画**，不是"稍微出格"而是断笔。
- **修法**：display 行 `line-height ≥ 1.18` **并且**留 padding，或者把容器按**实测墨迹高度**定尺寸。F05 的最终写法是 `.f05-g { height: 172px }`、`#f05-l3 .f05-g { height: 189px }`，注释写着"字形盒故意比墨迹高（1.06em）：做揭示的 clip
绝不能切到 CJK 笔画"。finding 的 `fixHint` 直接给出收敛目标（约 183–194px）。
- **怎么自动发现它**：`npx hyperframes check` 的 `text_box_overflow`，读 finding 里的 `overflow.bottom` 与 `fixHint`，不要只看有没有这条 finding。注意它是 **info 级**、不 gate：本片最终一次聚焦检查里 F05 的"能"仍报 11px
（`overflow.bottom: 10.54`）——**记录它，不要为了清零去缩字号**。

### 9. 文字被另一个元素压住

- **症状**：`check` 报 `text_occluded`（*"Text is hidden beneath an opaque element."*）。真发生过：F05 三条规则的 `#f05-l1` 第三列被下一行 `#f05-l2 > div:nth-of-type(1)` 盖住，`coveredFraction: 0.33`；F15 的两个角标 `#f15-c1` / `#f15-c2`
（`01` / `02`）被字幕容器盖住 `coveredFraction: 0.67`。
- **根因**：两块文字的纵向区间重叠，后面的元素（规则线、面板、下一行）压在前面那块上。
- **修法**：**每块文字各占一个互不重叠的纵向区间**。F05 的规则线按行分别定高：`#f05-l1 .f05-tick { top: 159px }` 对 `#f05-l2 .f05-tick { top: 177px }`，CSS 注释即规则本身——"each stays inside its own zone, clear of the ink above it"。
**不要**用 `data-layout-allow-occlusion` 掩盖：本片只在真的层叠结构上用（F27 卡面正反面、F33 落版遮罩）。
- **怎么自动发现它**：`npx hyperframes check` 的 `text_occluded`（带 `coveredFraction`）；兄弟码 `content_overlap`（*"Two text blocks overlap and may render unreadable."*）连**两条字幕撞在一起**都能抓到——F22 的 `#f22-sub1` 与 `#f22-sub2`
就是这么暴露的。

### 10. 故意超出裁切容器的图层要声明

- **症状**：`check` 报 `container_overflow`（*"Element extends outside a clipping layout container."*）或坐标框架类的 `escaped_container`，但那些溢出本来就是效果。
- **根因**：layout 审计量的是 `getBoundingClientRect`，**`overflow: hidden` 只在视觉上裁掉，不会压掉 finding**。滚动的麦田、跑马灯、粒子层、扫光本来就该超出容器。
- **修法**：在该元素上加 `data-layout-allow-overflow`（本片：`#f20-ears`、`#f21-ears`、`#f22-ears`、`#f23-ears`、`#f32-far/#f32-near/#f32-rim`、各帧的 `#fNN-sweep`；`HF.ground` 返回的床与 `.pool`、`rays` 也在脚本里
`setAttribute('data-layout-allow-overflow','')`）。**只在该溢出就是效果时使用**，而且标**最小的装饰性 wrapper**：这个属性沿子树继承，会连带压掉 `text-clipping`、`content-cramped-container`、`foreground-over-panel`。`--tolerance`（默认 2px）是给"像素级擦边"的，不是消音器。
- **怎么自动发现它**：`npx hyperframes check` 的 `container_overflow` / `escaped_container`，fixHint 直接点名这个属性；加属性之前先 `npx hyperframes snapshot` 确认溢出确实是你想要的，再用 `scripts/audit-still.mjs` 做像素交叉验证。

### 11. `vw` / `vh` 在帧内是错的

- **症状**：非全屏预览时版面被放大，预览与渲染不一致，尺寸全靠运气。
- **根因**：帧根设了 `container-type: size`，帧内一切相对单位应当相对**容器**；`vw`/`vh` 相对**视口**，于是在不同预览尺寸下算出不同的数。
- **修法**：帧内一律用 `cqw`/`cqh` 或 px。共享构造器已经是这个口径：`HF.ground` 的默认 `poolW: '78cqw'`、`poolH: '88cqh'`。
- **怎么自动发现它**：`scripts/verify-frames.mjs` 第 5 步，两个正则 `/(^|[^a-zA-Z-])\d+(\.\d+)?vw\b/` 与 `…vh\b` → `uses vw units (cqw/cqh required)`。

### 12. 禁止对 `.clip` 元素做 `display` / `visibility` / `autoAlpha` 动画

- **症状**：lint 报 `gsap_animates_clip_element`；即便强行渲染，clip 的可见窗口也会和你的动画互相覆盖。
- **根因**：**可见性归框架所有**，它按 `data-start` / `data-duration` 决定 clip 何时在屏上；你再动一遍就是两个主人。
- **修法**：要淡入淡出就**动画它的子元素**。本片每帧都是 `<div class="clip" id="fNN-scrimclip" data-start=… ><div id="fNN-scrim"></div></div>` 这个形状，动的是里面的 id，从不碰外层 `.clip`。
- **怎么自动发现它**：`npx hyperframes lint` 的 `gsap_animates_clip_element`（error，无豁免）。顺带自查：每个有时序的视觉元素都要 `data-start` + `data-duration` + `class="clip"` + 一个稳定 `id`（lint 对缺 id 会警告，Studio
也无法把它当编辑目标）。

### 13. 不要把初始 `transform` 写在 CSS 里、又用 GSAP 动画同一属性

- **症状**：lint 报 `gsap_css_transform_conflict`；即便压过去，CSS 初值与 tween 起点也会互相打架，开头几帧的位置是错的。
- **根因**：CSS 的 `transform` 与 GSAP 写的 `transform` 是同一个属性，两边各自以为自己定义的是起点。典型来源：用 `transform: translate(-50%,-50%)` 做居中，然后 GSAP 去动 `x`/`y`。
- **修法**：**用 `fromTo` 声明起止**；居中改用 flex 或 `inset: 0`，需要百分比位移就用 `xPercent`/`yPercent`。
- **怎么自动发现它**：`npx hyperframes lint` 的 `gsap_css_transform_conflict`（error）。这一条属于"第一次构建必然踩"的那一类，写的时候就按对的方式写。

### 14. 十进制 px 字符串当动画长度

- **症状**：`width: '326.80px'` 会从大约 **10 倍**处开始插值——画面上表现为条/线/遮罩一开场就爆出画面。
- **根因**：GSAP 对带单位的字符串做数值解析时，小数点的写法让它按另一种基准取值。
- **修法**：用**纯数字**（`width: 326.8`），或干脆动 transform（`scaleX`、`x`）——transform 量得准。F09 里 `width: '0px' → '1180px'`（整数字符串）是安全的；**只要出现小数就换成 transform**。
- **怎么自动发现它**：静态扫 `(width|height|left|top|x|y): '\d+\.\d+px'`（本片最终 33 帧里 0 命中，说明这个自查是收敛的）；后果则由 `check` 的 `container_overflow` / `text_box_overflow` 在渲染后暴露。

### 15. 全屏底色要放在 `class="clip"` 的图层上，不要放在 `#root`

- **症状**：深色内容落到 body 上（默认白）而看不见，或者整帧发灰。
- **根因**：分层合成路径（HDR 内容，或用了 shader 转场的合成）会**把每个合成根强制透明**，好让下层透出来——于是画在 `#root` 上的全屏填色被丢掉了。普通渲染路径不会，所以这个坑只在特定合成上出现。
- **修法**：全屏填色放在全幅**子层**上：`position:absolute; inset:0` 的 `class="clip"` 图层（本片每帧的 `#fNN-ground` 就是这个角色）。host 侧再兜一层：`index.html` 里 `html, body { background: #07070a }` 与 `#root { background: #07070a }`，
注释写明"so dark content never lands on the host body's default white"。
- **怎么自动发现它**：像素体检 `scripts/audit-still.mjs`——`meanLuma < 1.2`（frame is essentially black）与 `litFrac < 1.0`（almost nothing lit）；`check` 侧的 `sweep_static`（3 秒以上的合成在所有采样点都没变化）
会把"黑成一片所以没有任何变化"也拦下来。

---

## C. 选择器与库

### 16. `HF.ground(root, …)` 把地面插到 `#root` 的**第一个子节点**

- **症状**：写 `#fNN-ground .pool` **匹配不到任何东西**，动画静默失效，GSAP 只打一条 warning。真实记录：`GSAP target #f22-chart .f22-grid not found.` —— `.f22-grid` 的父节点是 `#f22-chartclip`，不是 `#f22-chart`（后者只装一个 SVG）。
- **根因**：`HF.ground` 的实现是 `root.insertBefore(g, root.firstChild)`，所以 `.ground`（以及它的 `.pool`、`.vignette`、`.grain`）是 **`#root` 的子元素**，**不是**你自己那个 wrapper 的子元素。选择器按错误的层级写，`querySelector` 返回
`null`，GSAP 收到空目标——**只警告，不报错**。
- **修法**：用 `.ground .pool`。子合成 CSS 会被编译器作用域隔离，所以 `.ground .pool` 不会串到别的帧。本片 F11 的注释就是这条规则的原话（"`#f11-ground .pool` would [not match]"），F08 / F12–F15 / F31–F33 一律用
`root.querySelector('.ground .pool')` 取引用，F03 / F10 用 `.ground .pool` 选择器。
- **怎么自动发现它**：`check` 的 runtime findings 里的 `console_warning`（`GSAP target … not found`，带 `line` 和 `time`，能直接跳回那一行）。它是 **warning 不是 error**，只有 `--strict` 才非零退出——所以把 runtime 警告数当成交付门槛看，
别只看 `ok`。

### 17. 不要 tween 一个你没创建的 id

- **症状**：空选择器、或者用未定义变量拼出来的选择器，同样**只产生 warning，然后什么也不发生**。真实记录：`GSAP target  not found.`——target 位置是**空的**（两个空格之间什么都没有），因为模板字符串里的变量是 `undefined`。
- **根因**：`gsap.to(sel, …)` 对匹配不到的目标不抛异常，只在 `console` 里警告一次；JS 里拼选择器不检查变量是否存在。
- **修法**：只 tween **本文件里写出来的** id；拼选择器之前先断言元素存在（`const el = root.querySelector(sel); if (!el) throw new Error('missing ' + sel);`）；不要用未定义变量拼选择器。动画脚本末尾不要顺手 log 别的东西——`check` 会把所有
console 输出当信号。
- **怎么自动发现它**：`check --json` 的 `runtime.findings[]`，code `console_warning`，消息里 target 为空即为本条。想让它变成硬闸门就用 `npx hyperframes check --strict`（warning 也非零退出）。`scripts/verify-frames.mjs`
不做这件事——它只查跨文件契约。

---

## D. 音乐与卡点

### 18. 用自相关测 BPM 在节拍歧义的音乐上会错

- **症状**：早期那个已被移除的探索脚本（自相关 + 90–140 BPM 偏好加权）给出 **64.6 BPM**（`audio/bgm-analysis.json`），**真值是 112.91 BPM**——差了近一个八度，用它排的每一拍都会错位。
- **根因**：这首曲子的节拍歧义很强，自相关在几个互不相关的 lag 上都出峰，靠"偏好 90–140"的权重救不回来。
- **修法**：改用**音头间隔直方图**（见 `references/01-audio-truth.md`；实现是 `scripts/hit-map.mjs`：STFT 频带通量 → 自适应阈值 picking → 按强度加权的 IOI 直方图），再用两条独立证据交叉验证：**4/4 vs 3/4 对比度**，以及**多少拍命中真实音头**与**中位误差**。真实结果：`scripts/timing-map.mjs` 拟合出 0.5314 s/拍 = **112.91 BPM**、**303 拍中 204 拍命中**真实音头、**中位误差 2.3 ms**；四拍对比度 **0.598** vs 三拍 **0.019** → 判 4/4。小节 2.1256 s，8 小节乐句 17.0048 s。
- **怎么自动发现它**：`audio/timing-map.json` 的 `gridFit`（`matchedBeats` / `totalBeats` / `medianAbsErrMs` / `meter3` / `meter4`）；`scripts/hit-map.mjs` 打印音头间隔直方图的 top 候选与它们的倍频关系，
专门用来一眼看出八度和三连歧义。

### 19. 字幕 cue 的时间不要手写

- **症状**：写死的时间在任何节奏改动后**全部失准**——改一次 `bars:`，几十条 cue 全要手工重排。
- **根因**：时间是**派生量**，`bars`（小节区间）+ 文案才是原始输入。
- **修法**：由 `bars:` + 文案经脚本推导：`scripts/sync-storyboard-timings.mjs` 反推每条 cue 并写回 `STORYBOARD.md`（`start` / `end` / `duration` / `cues` 是派生键，每次**全量重建** frame block 而不是就地拼接，所以幂等、不会串行），同时输出
`audio/cue-map.json` 供下游脚本使用。
- **怎么自动发现它**：`node scripts/sync-storyboard-timings.mjs --check`（只报告，有问题退 1）；下游再由 `scripts/verify-timing.mjs` 重新断言"每条 cue 落在拍线上"（容差 `TOL_MS = 15`；实测 41/41，最差 5.5 ms）。

### 20. 排 cue 时必须先定起点再夹终点

- **症状**：早期实现**先算时长再算起点**，产生**两条重叠 cue** 和**一条 0.88 秒**、超出阅读速度上限的 cue。
- **根因**：按阅读负载分摊时长时，起点是从前一条的终点推出来的；一旦时长算错，错误会顺着链子传下去——终点越过下一条的起点，两条 cue 就重叠。
- **修法**：分两趟。**PASS 1** 先把起点吸附到**严格递增**的拍线（`while (s < ideal.s) k += 1`，再 `if (k <= lastK) k = lastK + 1`）；**PASS 2** 再把每条终点**夹到下一条起点之前**：`e = Math.min(s + ideal.d, starts[n+1] - MIN_GAP, w1)`，
`MIN_GAP = 0.08`，并用 `if (e <= s + 0.3)` 兜底。
- **怎么自动发现它**：`scripts/sync-storyboard-timings.mjs --check` 的 reading-speed report（重叠/过短会体现为 `too short`）；视觉侧由 `check` 的 `content_overlap` 抓到（F22 的 `#f22-sub1` / `#f22-sub2` 就是两条字幕叠在一起被报出来的）。

### 21. 字幕要过阅读速度闸门

- **症状**：字幕读不完，或者一闪而过。**上限 6.5 字/秒、下限约 1.2 秒**。
- **根因**：文案量与小节数不匹配；靠"压缩时长"是压不出可读性的。
- **修法**：**改文案或给它更多小节（`bars:`），不能硬压**。负载按字形加权：CJK 1.0、拉丁/数字 0.5、标点 0.3、空格 0.15；`cps = load / duration`。
- **怎么自动发现它**：`scripts/sync-storyboard-timings.mjs` 的 `too fast`（`cps > 6.5`）与 `too short`（`d < 1.2`），并在结尾打印 `cps: min / median / max`；`--check` 时有问题直接退 1，可以放进出片前的门禁。

### 22. 音效不能按猜出来的模式摆放

- **症状**：真事——把 F5 三条规则的音效按"**每 8 拍一条**"摆放，**第三条落到了该帧结束之后**（声音在画面切走之后才响）。
- **根因**：音效的位置来自"画面什么时候落字"，不是来自一个看起来整齐的步长。脚本注释就是结论：*"Placing them on a naive '+8 beats' step pushed the third tick past the frame's own end — audio must follow the visuals, not a guess."*
- **修法**：**音效跟着画面的实际重音走**——每帧自己的 `.hyperframes/accents/FNN.json`（每帧构建者写出的真实重音时刻，`localS` + `on: "bar"|"beat"`），或该帧的小节线。F5 最终用的是该帧起始拍号 `b0` 的 `b0, b0+4, b0+7`。cue 一律用 `beat(k)` /
`bar(k)` 声明，不由人肉秒数写：`scripts/build-sfx-map.mjs` 负责设计，`scripts/mix-soundtrack.mjs` 只负责混。
- **怎么自动发现它**：`scripts/build-sfx-map.mjs` 的越界断言（`runs past the track end` / `negative start` / 素材不够长）与结尾的 `N/40 cues land within 15 ms of a beat line`；再由 `scripts/verify-timing.mjs` 第 3 项（音效 40/40 在拍线，
最差 1.7 ms）与第 4 项声学复核确认"真的响了、真的在那个位置"。

### 23. 静帧像素检查的亮度阈值必须区分「文字」和「景物」

- **症状**：用 **60 luma** 当阈值会把**麦田判成"字幕提前出现"**。真发生过。
- **根因**：字幕是 paper 色（约 **230 luma**），麦秆最亮约 **98**——两者都过 60，阈值没有区分力。实测记录：F10 开场字幕带在 60 luma 以上占 **4.9%**，在 120 luma 以上占 **0.000%**。
- **修法**：把阈值提到 **150**（`TEXT_LUMA = 150`），并要求字幕带里亮于该阈值的像素占比超过 `INK_LIMIT = 0.25`% 才算"字幕在"。诊断时用同一走带在**多档亮度**上复核（本片的做法是同时看 60 与 120 两档，确认墨迹是文字而不是景物）。
- **怎么自动发现它**：`scripts/frame-openings.mjs` —— 这个常量就是修法本身，脚本逐帧打印 `subtitleInk%`，所以换阈值后的复核是免费的。像素体检的另一半是 `scripts/audit-still.mjs`（逐带 `ink%`，用 60 阈值判"**有没有**字"，方向与误报相反，
因此不会被麦田骗到）。

---

## E. 流水线与环境

### 24. `check` 的默认采样数在 30+ 场景的长片上会超时

- **症状**：161 秒 / 33 场景，默认 9 采样直接报 **`check_runtime_failure: Check did not finish within its deadline.`**，`browserSkipped: true`，随后 layout 与 contrast 全空。真实 artifact：`.hyperframes/artifacts/checks/6931ecb6-…json`。
- **根因**：Chrome 侧一轮 seek 扫描的耗时随采样点与合成长度增长，撞上 deadline。**这不是内容缺陷**——把它当作"帧的问题"去改 HTML 是纯粹的浪费。
- **修法**：`npx hyperframes check --samples 3` 降采样（必要时用 `--at` / `--range` 把扫描限制在有问题的区间——F05 那次聚焦检查的 JSON 里 `scope.range` 就是 `[26.2, 29.2]`），或者用 `--timeout 30000` 抬高下限；
确认干净之后再按需加回采样密度。
- **怎么自动发现它**：`npx hyperframes check --json` → `runtime.findings[].code === "check_runtime_failure"`。看到它先去调采样，不要先怀疑帧。

### 25. lint 有 error 时，版面与对比度审计会被关掉

- **症状**：输出显示 `0 issue(s) across 0 sample(s)`、`0/0 text checks`，**看起来像干净通过，其实什么都没跑**。真实 artifact（`4e22874e-…json`）：lint error `missing_timeline_registry` → `browserSkipped: true`、`layout.samples: []`、
`contrast.checked: 0 / passed: 0`。
- **根因**：`check` 先跑 linter，**lint 报 error 时整个浏览器阶段被跳过**；JSON 里 `layout` / `motion` / `contrast` 三节是"空"而不是"干净"。
- **修法**：**先清零 lint error，再相信那些数字**。看到采样数为 0 就去修 lint，而不是去改版面。
- **怎么自动发现它**：`check --json` 里先读 `browserSkipped` 与 `lint.errorCount`。只要 `browserSkipped === true`，`layout` / `motion` / `contrast` 一律视为**未运行**。

### 26. `npm` 能用不等于 `git` 能用

- **症状**：`npx hyperframes skills update` / `npx hyperframes init` 里的 **git clone 直接失败**，而 `npm`/`npx` 装包一切正常。
- **根因**：机器上残留 `git config --global http.proxy=http://127.0.0.1:7890`，代理没开时 git 全部走死；npm 走 registry，不受这条配置影响。另外 GitHub 的可达性会变：`api.github.com` 可能通而 `github.com:443` 不通。
- **修法**：先用单次覆盖验证是不是代理问题：`git -c http.proxy= -c https.proxy= ls-remote <url>`；确认后 `git config --global --unset http.proxy`（https.proxy 同理）。`github.com:443` 不通时**用 GitHub REST API 发布**（blobs → trees →
commits → 更新 `refs/heads/main`），**不要死等 `git push`**。
- **怎么自动发现它**：`npx hyperframes doctor --json`（`doctor` 本身永远退 0，要 gate 在 payload 的 `ok`）；git 步骤失败时先跑上面那条 `ls-remote` 再决定是网络还是别的问题。

### 27. winget 装完 FFmpeg，已经在跑的 shell 里看不到

- **症状**：`ffmpeg` 在**新开**的终端里有，在**已经在跑**的会话里没有——所有依赖 FFmpeg 的脚本一起失败。
- **根因**：winget 改的是**持久 PATH**，当前进程及其子进程不会刷新环境变量。
- **修法**：在会话里显式把 bin 目录前置：`. scripts\env.ps1`（它把 winget 包目录插到 `$env:PATH` 最前面并导出 `$global:FF` / `$global:FP`）。**启动前先 `doctor` 确认 Chrome 缓存与 FFmpeg 都在**
（`npx hyperframes doctor --json | jq -e '.ok'`）。
- **怎么自动发现它**：`npx hyperframes doctor --json` 会核对 FFmpeg / FFprobe 条目与路径；脚本侧兜底是 `scripts/env.ps1` 里的 `Write-Warning "FFmpeg dir not found at $ffDir"`。

### 28. PowerShell 会用 ANSI 读 `.ps1`

- **症状**：辅助脚本里出现中文路径（本工作区路径就含中文）会让**引号解析崩掉**，报的却是莫名其妙的语法错误。
- **根因**：这台机器上 PowerShell 以 **ANSI** 读取 `.ps1`，非 ASCII 字节会破坏解析。
- **修法**：辅助脚本**保持纯 ASCII**，路径由 `$PSScriptRoot` 推导，绝不硬编码中文路径。`scripts/env.ps1` 开头就写了这条 NOTE 和 `$global:ROOT = Split-Path $PSScriptRoot -Parent`。
- **怎么自动发现它**：`Select-String -Pattern '[^\x00-\x7F]' <file>.ps1` 扫出任何非 ASCII 字节所在行——`.ps1` 的命中数应当是 0。

### 29. `ebur128` / `volumedetect` 把结果写在 stderr

- **症状**：只捕获 stdout 会得到**一片 `null`**，看起来像"测量失败"，其实结果被丢弃了（`audio/mix-report.json` 里 `truePeakDb: null` 就是这类丢失的痕迹）。
- **根因**：FFmpeg 的 `ebur128` 与 `volumedetect` 把报告写在 **stderr**；`execFileSync` 默认只回 stdout。
- **修法**：Node 里用 **`spawnSync` 并把 stderr 一起读**：`const o = \`${r.stdout || ''}\n${r.stderr || ''}\``，再用正则取 `I:` / `LRA:` / `Peak:` / `mean_volume:` / `max_volume:`。`scripts/mix-soundtrack.mjs` 的 `measureOnly()`
就是这么写的，注释也把原因钉住了（"this must be spawnSync, not execFileSync (which returns stdout only and would read as an all-null result)"）。
- **怎么自动发现它**：`node scripts/mix-soundtrack.mjs --measure` 会直接打印 mix 与 sfx stem 两段测量；混音流程自带的 sanity gates 也会拦：时长与轨道差 ≤ 0.35 s、true peak ≤ −0.8 dBFS、integrated 落在 −18..−11 LUFS。

### 30. 子合成里的资源路径是相对该子合成文件写的

- **症状**：路径位置写错就会出现"**检查通过、渲染缺图/缺字体**"。
- **根因**：有**两套**相对基准同时成立——(a) 子合成里的资源路径是**相对该子合成文件**写的，汇编器会把它改写成 host 相对路径；(b) **外链 CSS 里的 `url()` 是相对该 CSS 文件**解析的。
- **修法**：两种情况各自都对，所以 `../../assets/fonts/x.woff2`（帧在 `compositions/frames/` 下，往上两层）与 CSS 文件旁边的 `./x.woff2` 都合法。`scripts/inject-fonts.mjs` 做的正是"把 `url('./` 改写成 `url('../../assets/fonts/`
再内联进帧"；帧里另外三个引用也按同一基准：`../lib/wheat.css`、`../lib/wheat.js`、`../../assets/lib/gsap.min.js`。
- **怎么自动发现它**：`scripts/verify-frames.mjs` 第 4 步断言这三个引用确实存在，第 3 步断言字体块是**内联**的（见第 6 条）；渲染后由 `scripts/audit-still.mjs` 的 `topLeftEdge` 兜底抓"CSS 没生效"。

### 31. 第三方素材的许可要如实记录

- **症状**：交付说明里笼统写"CC0 素材"——这是**不实陈述**。
- **根因**：`mixkit.co` 是 **Mixkit Free License**（可商用、免署名），**不是 CC0**；freesound 的 API 需要 token（本网络环境 Openverse 也不可达）。
- **修法**：**逐条写进许可台账** `audio/sfx-licenses.json`：`scripts/fetch-sfx.mjs download <id…>` 每下载一条就写一条记录（id、file、title、bytes、source、page、license、licenseUrl），交付说明按台账原文写。
- **怎么自动发现它**：台账 `audio/sfx-licenses.json` 的 `files[]` 条数应等于**实际用到的素材文件数**（本片是 19 个文件支撑 43 条 cue，逐条在册；不是 43 条）；`scripts/fetch-sfx.mjs catalogue` 输出里的 `license` 与 `licenseUrl` 就是台账条目的原文，可直接核对。

---

## F. 诚实的边界

### 32. 声学校验有它做不到的事

- **症状**：包络互相关**无法把两条相距 < 350 ms 的音效各自定位**——两个模板重叠，此时一个边界大小的误差是**歧义**，不是错位。
- **根因**：互相关找的是"模板在成品里的最佳 lag"；当另一条 cue 在同一窗口里响，最佳 lag 会被邻居吸走。
- **修法**：标为 `ambiguous`，**不能算作通过**。`scripts/verify-timing.mjs` 第 4 项把结果拆成三档：`independentlyVerified` / `ambiguous` / `weakCorrelation`，只有非 ambiguous 且 `correlation > 0.35` 的才进入误差统计，容差还按声音形状分
（`hit 25 ms`、`whoosh 80 ms`、`riser 80 ms`）。真实数字：交付口径是 **40 条里 12 条**与另一条相距 <350 ms、标为 ambiguous、其余 28 条独立验证、误差中位 2.7 ms；磁盘上最新一次 `audio/timing-verification.json` 记的是 40 条中 **31 条独立验证 / 9 条 ambiguous**、中位误差 2.7 ms、最大 |err| 58.7 ms（一条 whoosh，故在它 80 ms 的容差内）。
- **怎么自动发现它**：`node scripts/verify-timing.mjs` 第 4 项那行输出——`N of 40 independently verified (M ambiguous: another cue within 350 ms)`；明细在 `audio/timing-verification.json` 的 `checks.acoustic`（含每条 cue 的 `ambiguous`
标记与 `correlation`）。**把 ambiguous 的条数原样写进交付说明。**

### 33. 不要为了消掉对比度警告去改设计

- **症状**：F05 出现一条 **2.9:1**（要求 3:1；132px 属于"大字"，阈值就是 3:1）：`text: "摘"`、`fg: rgb(99,94,87)`、`bg: rgb(21,18,19)`。它**只出现在某帧入场渐显的过渡帧**——采样点是 `[26.575, 27.325, 28.075, 28.825]`，只有 28.825
这一条命中，`checked 14 / passed 13`，**终态全部合格**。
- **根因**：文字正在从透明淡入，采样恰好落在中间态；这不是配色错误。
- **修法**：**记录它、解释它，而不是破坏设计**。`check` 的严重度是**持久性感知**的：只出现在单个采样点的入场/出场瞬态会降级为 info/warning，不 gate。
  但要小心：**"是瞬态"这个判断必须验证，不能推断。** 本片最初把 F05 的 4 条 `text_not_painted` error 解释成"金色字形冷却成金属底色的揭示过程，是设计"——**这个解释是错的**（见条目 35），它其实是 F05 前两条规则根本没画出来。所以：当一个 error 出现在某个 tween 的边界上时，不要停在"那大概是入场瞬态"，要沿这一帧多取几个时间点量一次墨迹，确认它之后**真的**稳住了。
- **怎么自动发现它**：`check --json` 的 `contrast.findings[].times`（看它出现几次）与 `contrast.checked` / `passed`（看比例）；`npx hyperframes check --at-transitions` 会把每个 tween 的起止边界一起采样，最容易复现这类瞬态；`tools/coverage-map.mjs` 会沿成片逐秒量大字区墨迹，是唯一能证明"它后来稳住了"的手段。
交付说明里逐条写"已知且有意"，并说明为什么——**但只写你验证过的那些**。

### 34. 一个"检查通过"不等于"好看"

- **症状**：像素统计能证明**文字在、没被裁、缩到 240px 仍可辨识**，但**证明不了好看**。所有闸门加起来也只能说明这一帧没有被机器识别的缺陷。
- **根因**：可测的是"在不在、压没压、亮不亮"，不可测的是"这一帧该不该这样构图、这个重音该不该在这里"。
- **修法**：**把审美判断交给人**，并把这件事写进交付说明。流程上：`npx hyperframes snapshot --at <midpoints>` 出接触表让人眼过一遍；`npx hyperframes preview --background` 做 Studio 交接（用 `preview --status` 确认在听、`preview --stop`
收尾，不要用 shell 的 background 包装 `npm run dev`）；交付说明里明确写出"自动检查覆盖了什么、**没**覆盖什么"——本片 README 的"已知边界"一节就是这份声明（字体子集、音效许可、ambiguous 的音效、故事出处、只支持 16:9）。
- **怎么自动发现它**：**没有任何脚本能发现它**。`scripts/audit-still.mjs` 只能证明"有光、有字、没炸、没跑进保留带（gap band y842–872）"，它不判断构图。所以这一步必须由人签字。

### 35. 用 tween 一个 CSS 变量做的遮罩去"揭示"文字，字会永远不出现

这是本片最贵的一个 bug：**成片已经交付之后才发现，F05 有连续约 5 秒是空的。**

- **症状**：`npx hyperframes check --samples 4 --range 26.2,29.2` 报 4 条
  `text_not_painted`——"Text paints with an effectively transparent fill
  (`-webkit-text-fill-color` / `color`), so its glyphs are invisible"，
  指向 F05 第 1、2 条规则里的「不」「能」「只」「能」。
  沿成片逐秒量大字区墨迹，得到的是这样一张图（F05 覆盖 25.92–34.43 s）：

  ```
   26.0  0.001%   <- 空
   27.5  0.084%
   28.25 0.002%   <- 空
   29.75 0.002%   <- 空
   31.25 0.002%   <- 空
   32.0  3.097%   <- 第一次真的有字，此时已过 6 秒
   32.75 5.719%
  ```

  三条规则本该在小节线 local 0 / 2.657 / 4.252 依次落下，结果前两条从不出现。

- **根因**：这一帧把"揭示"交给了两套互相打架的机制。
  1. `.base` 上有一条**遮罩**：`-webkit-mask-image: linear-gradient(to right, #000 0, #000 var(--f05-mask), transparent var(--f05-mask))`，
     而 `--f05-mask` 的初值是 `0px`。在 `0px` 上这条渐变**整体透明**——整行字被遮没了。
  2. 循环里再用 `tl.fromTo([o.t.sweep, o.t.base], { '--f05-mask': '0px' }, { '--f05-mask': '1040px', … })`
     把它当擦除动画推出去。
  3. 同时又有 `tl.to(o.t.chars, { color: 'rgba(251,241,210,0)', … })` 把字形填充**淡成全透明**。

  三者叠加：该显示金属底色的那份被遮罩按住，该退场的金色那份真的退干净了，于是什么都不剩。

- **修法**：**别用遮罩去揭示文字。** 金属字用**静态**渐变（`background-clip: text` + `color: transparent`）
  一次定好，动画只碰 `opacity` / `y` / `scale` / `filter: blur()`。想要高光扫过就让它当一个
  **独立元素**横穿，而不是给文字加 mask。同一部片的 F01（巨大的「？」）和 F12（「这就是爱情」）
  用的就是这个形态，全程正常。**永远不要 tween `color`、`-webkit-text-fill-color`、
  `background-image`、`background-position`、`mask-image`，或任何遮罩依赖的自定义属性。**
- **为什么所有闸门都没抓到它**：`check --samples 9` 是在 161 秒上取 9 个点，
  平均 18 秒一个——**采样点根本没落进 F05**。闸门取样的是"影片"，不是"帧"。
  修法是把逐帧扫描加进流程：`tools/coverage-map.mjs --every 1.0`。
- **怎么自动发现它**：`tools/coverage-map.mjs`。但要注意它**只能给出确定判断**的前提是
  该帧的 `.hyperframes/accents/FNN.json` 里给显示型文字标了 `"text": true`——
  没有这个标注，"一个坏帧"和"一段正常的三秒铺垫"在像素上完全一样。
  本片实测：只用像素的判断报了 9 帧，其中 8 帧是设计好的铺垫（一条细轴、一个右上角小读数、
  一个画面上缘的小字标签），只有 1 帧是真坏的。**假阳性率这么高的闸门比没有闸门更糟**，
  所以 `coverage-map.mjs` 对无法判定的帧只列进"值得人看一眼"，不报错。
