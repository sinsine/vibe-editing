# 03 · 视觉设计系统 — 怎么给一部新片写 `frame.md`

这份文件教你（做片子的 agent）**为一个新主题从零写一份 `frame.md`**。规范本身不在这里，在
`skills/hyperframes-creative/references/design-spec.md` —— **frontmatter 的键、取值方式、以及
"什么算规范层"以它为准**，本文只教你怎么做出那些决定（以及共享库 `compositions/lib/` 怎么承接它们）。

## 1. `frame.md` 是什么，为什么要有它

项目是四层，每层只回答一个问题，**不许越层**：

| 层 | 文件 | 回答 | 谁读它 |
| --- | --- | --- | --- |
| 意图 | `BRIEF.md` | 为什么做、给谁看、什么调性 | 人（你，开工前） |
| 内容 | `STORYBOARD.md` | 讲什么、逐帧、每帧落在哪根小节线上 | 你 + 时间轴工具 |
| 外观 | `frame.md` | 长什么样：颜色、字体、间距、组件 | 你（每一帧）+ 构建者 |
| 实体 | `compositions/` | 东西本身（`frames/*.html` + `lib/`） | 渲染器 |

`frame.md` 存在的理由只有一个：**让 30 多帧看起来像同一部片，而不是 30 多个人的作品。**
它把"这一帧该用什么颜色"从每帧的即兴判断，变成一次性的、可引用的决定。构建者不被允许
自己发明色值 —— 它只能引用 `{colors.…}`。

**规范层与意图层不对等**（见 `design-spec.md`）：

- **frontmatter 是规范层**：`colors` / `typography` / `spacing` / `components` 是真实的、机器读的值。
  逐字引用（精确 hex、精确字体族、精确字重），**不许发明，不许四舍五入**。
- **正文 `##` 是意图层**：token 装不下的判断 —— 什么时候用、为什么这么用、不许怎么用。
  读它是为了判断力，不是为了取值。

解析顺序是 `frame.md` → `design.md` → `DESIGN.md`，第一个存在的胜出。**`frame.md` 永远小写**，
没有 `FRAME.md` 变体 —— `frame-presets/` 里那些 `FRAME.md` 是**模板**，被复制进来时才落地成
小写 `frame.md`。从 preset 起步是可选项，不是必须。真实那份
`videos/socrates-wheat-ear/frame.md` 的每个 token 都是为这部片做的，没有套用任何 preset 的配色。

**spec 不是全部 —— token 之下还有一层共享库。** `compositions/lib/wheat.css` 把颜色 / 字体 / 间距
落成真实的类（`.t-display` … `.t-label`、`.metal`、`.bloom`、`.hairline`、`.band-display` /
`.band-sub` / `.band-chrome`、`.fig-block`、`.card`），`compositions/lib/wheat.js` 落成确定性构造器
（`HF.ground`、`HF.ear`、`HF.field`、`HF.dust`、`HF.dotAxis`、`HF.timelineBar`、`HF.figure`、
`HF.hand`、`HF.register`、`HF.rng`）。**每一帧 link 这两个文件，而不是自己写一份 CSS**；
一个组件如果第二帧还要用，它就该进 `lib/`。spec 管"能用什么"，`lib/` 管"怎么实现"。

## 2. 为一个新主题写 spec：按这个顺序做决定

顺序不能换。前面的决定约束后面的，反过来做就会出现"配色很漂亮但说不清为什么"的 spec。

### (a) 一个 ground + 每帧一个光源

先定 ground，再定光。ground 的职责是**给光留出余地**：真实的例子是暖近黑
（`#07070A` / `#0B0A0E`），而不是 `#000` —— 纯黑没有地方放暖光池，片子看起来就是平的。

然后是"每帧恰好一个光源"。这不是一句风格描述，是架构：`HF.ground(root, opts)` 一次把
ground（base → 一个 radial 光池 → vignette → grain）插到已有内容之后、rays 紧贴其上、
dust 浮在主体之前 —— 帧作者永远不需要想层级。你在 spec 里定的是**光池的默认值和摆法规则**
（`--pool-x` / `--pool-y` / `--pool-w` / `--pool-h` / `--pool-strength`，默认 `50%` / `42%` /
`78cqw` / `88cqh` / `0.5`）。逐帧覆盖 `poolX/poolY/poolStrength` 就是在说"这场戏的主光在哪、多亮"：
一只落在画面下方的麦粒，光池就在下方（`poolY:'74%'`, `poolStrength:0.34`）——
光和内容是同一件事的两种说法。

### (b) 两个 register，每个 register 承载一个含义

这是整份 spec 里最值钱的决定。真实的例子，如实写出它的映射：

- **`gold` = chosen / lit / now / you** —— 被选中的、被照亮的、此刻的、你。
- **`slate` = unobserved / passed / not-yet** —— 未被观察的、已经过去的、还没到的。

为什么**有含义**的映射比好看的配色值钱：① 颜色因此承担论证而不是装饰 —— 37% 的观察区间是 slate、
行动区间是 gold，同一个 timeline bar 里颜色分开就是整个论点，麦穗只在被摘下的那一刻变 gold，观众
不需要图例；② "用错色"从审美分歧变成**可判定的 bug**，能写进自检清单、能被人一眼抓住，而"这个金色
不太对"不能；③ 它挡住后续的诱惑 —— 只有两个 register 时，第 8 帧想加第三种颜色，你会先问"它表示
什么"，而答案通常是"不表示什么"。

自检：**把 token 名字抹掉，还能不能说出这个元素为什么是这个色？** 说不出来，就是装饰。
同一 register 内的强调永远只用 **scale、weight、opacity**，不加新色相。

### (c) 字体系统：一个内容层，一个家族

真实的例子是三个家族对三个叙事层：

- **sans（HarmonyOS Sans SC）** = 当下 / 你 / 现代 —— 钩子、应用、落点。
- **serif（Noto Serif SC）** = 寓言 / 2400 年前 —— 爱、婚姻，以及命名它们的那四个字。
- **mono（Cascadia Mono）** = 数学 / 数据 —— 每一个数字、坐标轴、术语。

映射必须是**可辩护的**，不是装饰性的：层数等于家族数，每个家族只服务它那一层。
如果两个层共用一个家族，那是因为它们本来就是同一层（正文和字幕就是）—— 而不是因为看起来协调。
好处很具体：**只看字体就能分辨片子的层**；观众看到 mono 就知道"这个数字被算过"。

三条硬约束写进 spec：

- **字重家族按安装名精确写出**（`… Black`、`… SemiBold`、`… Medium`）。Windows 把它们暴露成
  独立家族；只写基础家族再要求 `font-weight: 900` 会**合成**假粗体。绝不这么做。
- **CJK display 的 tracking 接近零**（`0.005em`）：笔画需要字怀。负 tracking 是拉丁文的动作。
- **fit-to-measure**：每帧一个 display moment，上限 `{spacing.display-max-w}`（82cqw），
  按字数下阶梯（≤6 汉字 → `display-lg`，7–12 → `display`，13–20 → `h1`，整句 → `h2`/`body`）。

### (d) 保留带

把字幕带、display band、chrome band 定成 `spacing` token（见第 5 节）。它们在 spec 里同时是**数值**
（构建者引用）和**硬规则**（正文里明写"别的任何东西不得进入"）—— 只写数值不写规则，下一帧就会有人
把图例放进去。

### (e) 禁止清单

写一份显式的 `### Don't`。禁止清单比一堆 Do 更能收敛风格，因为它可判定。真实那份里有：
纯黑 ground、第二个光池、`vw` 单位、2px hairline、圆角卡片、第二个 accent 色相、手打数字、
越界进字幕带、合成粗体、给 CJK display 加负 tracking。**这份清单是给未来的自己看的**，
所以每条都要能一眼验证。

## 3. 深度来自光，不是阴影

"有光影感"在没有 3D 引擎、没有贴图、没有后期的情况下，靠的是下面这一套固定技术栈。
每条都是真实在跑的，数值就是真实数值：

1. **一个暖光池** —— `radial-gradient`：`rgba(224,180,92,strength×.62) 0%` →
   `rgba(176,126,46,strength×.34) 34%` → `rgba(92,63,19,strength×.16) 62%` → 透明 100%，再
   `blur(2px)`；强度上限 **0.55**。它是主光，给出方向。
2. **≤3 条 god rays** —— 从光池原点出发的模糊楔形：`12cqw × 160cqh`，`top:-30cqh`，
   `linear-gradient(rgba(251,241,210,.10) → rgba(224,180,92,.05) 45% → 透明)`，`blur(26px)`，
   opacity ≤ **0.10**，永不硬边。它给光池体积感。
3. **Bloom，只给 accent** —— `drop-shadow(0 0 24px var(--glow-warm))` 加一个模糊复制体 @0.35。
   这是**唯一**的发光技术。它给光一个峰值。
4. **一次 specular sweep** —— `linear-gradient(105deg, transparent, gold-100 @ .55, transparent)`
   蒙版过金属大字，**每次 reveal 一次**，跟拍，永不循环（配套 `.metal`：178° 的
   `gold-100 → gold-500 → gold-700 → gold-300` 渐变 + `background-clip:text`）。它让金属读成金属。
5. **Seeded dust，两个 parallax 深度** —— `HF.dust({count,seed,minR,maxR,opacity})` 生成 8–26 个
   1–4px 的模糊点，near/far 交替（近的更大更实、远的更小更糊），opacity .10–.45，缓慢漂移。
   位置来自 `HF.rng(seed)`（mulberry32），**绝不用 `Math.random()`**，否则渲染不可复现。
6. **4% grain** —— 140×140 的 `feTurbulence` fractalNoise（`baseFrequency .9`，3 octaves），
   `opacity: .04`，逐帧静态。它不显眼，但拿掉之后黑会 banding。
7. **Vignette** —— 边缘压到 `rgba(0,0,0,.72)`（椭圆从 38% 处开始透明）。它把光收进画面。

**Ceiling（同样重要）：** 不许第二个光池，不许用 drop shadow 当 elevation，不许 bevel，不许 3D
extrude，不许给卡片加 `box-shadow` —— 用 1px hairline 和光池代替；层级来自 scale、weight 和 register。

一句话总结：光池给方向，rays 给体积，bloom 给峰值，sweep 给材质，dust 给空气，grain 和 vignette
把它压回画面。这就是全部 —— 所以这套东西才可以被写进 spec 并被逐帧检查。

## 4. Craft bar 就是肉眼测试

规格检查抓不到"不好看"。所以在任何结构检查之前，先过四条肉眼测试（真实那份写在 craft bar 里）：

- **Light** — 画面里是不是**恰好一个**光源，而且读起来像被它照亮的？
  *失败长相*：均匀亮度，或者三个互相打架的光池。**自检**：我能指出光池的位置吗？
- **Squint** — 眯眼看，是不是**只有一个 display moment**，在 3–6× 上压过其他一切？
  *失败长相*：两个字块一样大，观众不知道该看哪。**自检**：这一帧的第二大元素有多小？
- **Silence** — 陈述帧读起来 **45–55% 是空的**（目标 ~50%）。
  *失败长相*：为了"不浪费画面"填满了装饰。**自检**：这帧是数据帧吗？不是就把东西删掉。
- **Register** — regA 表示含义 A，regB 表示含义 B。
  *失败长相*：一个 regA 元素什么都不表示（真实那份就是"一个金色元素"）。**自检**：每个有色元素我都能说出它的含义吗？

## 5. 保留带是结构性保证

"字幕不遮挡动画"不能靠眼睛保证 —— 眼睛在几十帧上是不可靠的。所以它被做成几何：

| 带 | y 范围 | 高度 | 只允许 |
| --- | --- | --- | --- |
| chrome | 60 → 120 | 60px | label / mono chrome（帧号、术语、出处） |
| display | 140 → 842 | 702px | display type、figure、diagram |
| guard | 842 → 872 | 30px | 干净：暗的图形层可以穿过，亮的内容不行 |
| subtitle | 872 → 1024 | 152px | **只有字幕轨** |
| bottom | 1024 → 1080 | 56px | 不用 |

关键点：

- **字幕带是被"预留"的，不是被"避开"的。** 任何 display type、figure、pictogram、chart 不得进入，
  任何字幕不得离开 —— 两个方向都禁止。字幕因此可以稳定地出现在同一位置，剪辑节奏和可读性都靠它。
- **`spacing.subtitle-band` 的 scrim 会伸进 guard。** 字幕的 `.band-sub` 自带一层从
  `top:-80px` 起、向上渐隐的 scrim（`scrim 0%` → `rgba(7,7,10,.72) 42%` → 透明）。
  所以 guard 的规则是"不许**亮内容**"，不是"不许任何像素"：暗剪影穿过没问题。
- **它是逐帧被验证的**，不是写在文档里的愿望：字幕带必须有墨，guard 带的亮墨不得超过 1.0%。
- **上边界也是设计。** display band 从 y 140 开始，因为上面 60–120 已经给了 chrome —— 帧号和术语
  永远不跟大字打架；这几个数字（60/120/140/842/872/1024）是一组，改一个就要重算其余。

## 6. 容易写错的规则

- **绝不用 `vw` / `vh`。** 每个 frame ground 设 `container-type: size`，所有 frame-relative 单位
  用 `cqw`/`cqh` 对它计算。`vw` 化的帧在非全屏时会被放大，整帧就错位了。
  静态检查直接把 `vw`/`vh` 判为失败。
- **绝不用纯黑。** 暖近黑给光池留出余地；`#000` 把池子吞掉。
- **hairline 只有 1px，矩形 0 radius。** 结构线（图表、坐标轴、分隔、刻度）用 1px，粗一点就不再
  是 hairline；每个矩形都是直角，圆是真的圆。
- **CJK display 保持接近零 tracking**（`0.005em`），拉丁可以负 tracking；**字重家族名要精确**
  （`… Black`、`… SemiBold`），基础家族 + `font-weight: 900` 会合成假粗体。
- **永远不用红/绿表示错/对。** 用两个 register 表达。真实那份把 63% 的失败率画成 dim gold 而不是
  警报红，因为片子的论点是"错过是正常的，不是紧急情况"。
- **两条真实的机械坑**：① frontmatter 的内联映射 `key:{ … }` 冒号后必须有空格，否则 YAML 直接
  解析失败（shipped preset 里就有一处这样写的）；② `Math.random()` 与 `Date.now()` 会让渲染不可复现，
  一律换成 `HF.rng(seed)`。

## 7. spec 怎么被消费

构建者被约束在这几节，逐字读、逐字用：

- **`## Overview`** —— 一个 ground、N 个 register、M 个字体家族，以及每个 register 的含义。
- **`## The Frame`** —— craft bar 四条 + 保留带几何 + container law。这是 build 前必读的一节。
- **`## Colors` / `## Typography` / `## Depth & Surface` / `## Shapes`** —— 各 register 的使用边界、
  字重与 tracking 规则、允许的深度技术及其 ceiling、radius 规则。
- **frontmatter `components` 的每条 `rule`** —— 每个组件一个可判定的规则加一句什么时候用。
- **`## Composition Rules` 的 Do / Don't** —— 帧级判断的速查。
- **`## Numerals & Claims (hard rule)`** —— 屏幕上的每个数字必须追到 `data/` 下的文件；
  引用类数字必须在屏幕上带出处（用 `{typography.label}`）。数字没有出处，这一帧就不发。
- **`## Pre-Render Self-Audit`** —— 每帧收工前逐条过。
- **`## Aspect-Ratio Behavior` / `## Known Gaps`** —— 范围声明：没授权的比例不要留投机布局，
  动效不在这里（在 `STORYBOARD.md`）。

正文引用 token 用 `{colors.regA-500}` / `{typography.figure}` / `{spacing.subtitle-band}` 的写法，
值以 frontmatter 为准。**机械的部分有两个工具在检查**：

- `tools/verify-frames.mjs` —— 文件级门禁：composition id 在根节点与 `HF.register()` 两处一致、
  `data-duration` 对得上 storyboard 槽位、6 个 `@font-face` 都在、`<style>` 不能留在 `<head>`、
  必须有 `<template>` 包裹、必须 link `../lib/wheat.css` 并引入 `../lib/wheat.js` 与本地 gsap；
  `vw`/`vh`、`Math.random()`、`Date.now()`、`crossorigin` 一律失败；必须存在 `.band-sub`。
- `tools/audit-still.mjs` —— 渲染后静帧审计：`meanLuma ≥ 1.2`、`litFrac ≥ 1.0%`、blown highlights
  ≤ 6%、左上角细节不能异常（那是"CSS 没生效"的特征）、字幕带必须有墨、**guard 带 y 842–872 的亮墨
  ≤ 1.0%**。它的 band 表就是第 5 节那张表。

三点诚实提醒：

1. **规范里写的检查脚本必须是存在的脚本。** 本片的 `frame.md` / `BRIEF.md` 一度引用
   tools/audit-layout.mjs（不加反引号，因为它不存在 —— 加了会让链接检查把它当成真路径）
   做 DOM 碰撞审计，而 `tools/` 里**从来没有这个文件** ——
   真正在跑的是 `npx hyperframes check`（它报 `text_occluded` / `content_overlap`）与
   `audit-still.mjs` 的分带墨迹检查。引用已改正。写 `frame.md` 时**只写你会真的运行的命令**：
   一份"看起来有闸门、其实那个脚本不存在"的规范，比没有规范更危险，因为它会让后来的人
   以为自己被保护着。
2. `audit-still.mjs` 与 `audit-covers.mjs` 的 `isGold` 判据是照暖金 ramp 写死的
   （`r > 78 && r > b+26 && g > b+8 && r ≥ g−6`），换主题时这个探测器要跟着改，否则 gold 占比永远是 0。
   它也是 `coverage-map.mjs` 之外少数几个**带色相假设**的检查——换色板时请一并复核。
3. 审美判断不在这些脚本的能力范围内，见 `99-pitfalls.md` 条目 34。
