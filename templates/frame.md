---
# ============================================================================
# frame.md — 本片的 frame-scale 设计系统（模板）。规范来源：
#   skills/hyperframes-creative/references/design-spec.md
#   · frontmatter = 规范层：机器读、逐字引用，hex / 字体族 / 字重不许改写或四舍五入
#   · 正文 ##    = 意图层：token 装不下的判断、when-to-use、约束
# 用法：把 <尖括号> 换成你的决定，把标了 `EXAMPLE` 的值换掉；regA / regB 是两个 register
# 的占位 token 名（真实的例子叫 gold / slate，另一些系统叫 ink / flame、paper / cobalt）。
# 四个键 colors / typography / spacing / components 一个都不能少；结构不要删：保留带、
# Numerals & Claims、Pre-Render Self-Audit 只能改内容，不能拿掉。
# ============================================================================
version: alpha
name: <Theme Name> — Frame (video / frame layer)
description: >
  EXAMPLE — 用一段话讲清：什么片、多长、什么比例、几个 register 各是什么意思、
  字体家族怎么分层、深度靠什么。下面这段是照抄真实项目的骨架，替换掉它。
  Cinematic <mood> system for a <161>-second <faceless explainer> about <主题>.
  One ground (<ground 的一句话描述>), one <regA> ramp that always means
  <含义 A>, one <regB> ramp that always means <含义 B>, and <3> type registers
  mapped to the film's content layers: <家族1> for <层1>, <家族2> for <层2>,
  <家族3> for <层3>. Depth is light, not shadow; motion and grain carry the life.
  Composition + frame scale only; motion lives in STORYBOARD.md.
unit: the frame — <1920x1080> only
principle: atoms are sacred · composition is free · numbers come from the data files

colors:
  # —— ground：一个基底。绝不能是纯 #000（纯黑里没有留给光池的余地）——
  ground: "#0A0A0C"          # EXAMPLE · 换成你的 ground
  ground-alt: "#0B0A0E"      # EXAMPLE · 可选：比 ground 高半档
  ground-raised: "#131118"   # EXAMPLE · 唯一允许的填充色（≤0.6 不透明度）
  # —— register A：<含义 A>。这套色只在表达这个含义时出现 ——
  regA-100: "#FBF1D2"        # EXAMPLE · 最亮档：只做高光 / specular 峰值，不做填充
  regA-300: "#F2D992"
  regA-500: "#E0B45C"        # EXAMPLE · accent 档：本片的主强调色
  regA-700: "#B07E2E"
  regA-900: "#5C3F13"        # EXAMPLE · 结构档：网格线、光池自身的颜色
  # —— register B：<含义 B>。与 register A 语义对立的另一极 ——
  regB-200: "#A8B8C6"
  regB-400: "#6C8095"        # EXAMPLE · 未选中 / 已过去 / 尚未状态的默认色
  regB-600: "#3B4A5A"
  regB-800: "#1E2731"
  # —— text：与两个 register 都分开，避免"文字被误读成语义色"；functional 只承担功能，不做装饰 ——
  paper: "#F2ECE0"
  paper-muted: "#A79C88"
  paper-hint: "#6A6153"
  scrim: "rgba(7,7,10,0.92)"          # 字幕带底部的渐变遮罩
  hairline: "rgba(224,180,92,0.22)"   # 暖 hairline（≈ register A）
  hairline-cool: "rgba(108,128,149,0.25)"  # 冷 hairline（≈ register B）
  glow-accent: "rgba(224,180,92,0.35)"     # bloom 用的 drop-shadow 色
  glow-hot: "rgba(251,241,210,0.55)"       # specular / catchlight 用

typography:
  # 每个内容层一个家族 —— 不是一个家族一套字重。家族 ↔ 层的映射必须是可辩护的
  # （真实例子：sans = 当下 / 你，serif = 寓言 / 2400 年前，mono = 数学 / 所有数字）。
  # 字重家族按安装名精确写出（'… Black'、'… SemiBold'）。Windows 把它们暴露成
  # 独立家族；只写基础家族再要求 font-weight: 900 会【合成】一个假粗体。
  # px 是相对 1920×1080 画布授权的（broadside preset 用 cqw，两种都合法，选一种并自洽）。
  #
  # register 1 — <层 1：它在片子里代表什么>
  display:    { fontFamily: "'<Family1> Black','<Fallback> Black',sans-serif", px: 132, weight: 400, lineHeight: 1.06, tracking: "0.005em" }
  display-lg: { fontFamily: "'<Family1> Black','<Fallback> Black',sans-serif", px: 196, weight: 400, lineHeight: 1.0,  tracking: "0.005em" }
  h1:         { fontFamily: "'<Family1> Black','<Fallback> Black',sans-serif", px: 96,  weight: 400, lineHeight: 1.12, tracking: "0.005em" }
  h2:         { fontFamily: "'<Family1> Medium','<Fallback> Medium',sans-serif", px: 64, weight: 400, lineHeight: 1.25, tracking: "0.01em" }
  body:       { fontFamily: "'<Family1>','<Fallback>',sans-serif", px: 40, weight: 400, lineHeight: 1.6, tracking: "0.01em" }
  # register 2 — <层 2：它在片子里代表什么>
  quote:      { fontFamily: "'<Family2> SemiBold','<Family2>',serif", px: 116, weight: 400, lineHeight: 1.18, tracking: "0.04em" }
  quote-sm:   { fontFamily: "'<Family2> Medium','<Family2>',serif", px: 56,  weight: 400, lineHeight: 1.45, tracking: "0.03em" }
  # register 3 — <层 3：它在片子里代表什么>
  figure:     { fontFamily: "'<Family3> SemiBold','<Family3>',monospace", px: 168, weight: 400, lineHeight: 1.0, tracking: "-0.01em" }
  figure-sm:  { fontFamily: "'<Family3>','<Family3>',monospace", px: 40,  weight: 400, lineHeight: 1.4, tracking: "0.02em" }
  label:      { fontFamily: "'<Family3> SemiBold','<Family3>',monospace", px: 25, weight: 400, lineHeight: 1.3, tracking: "0.16em" }
  # subtitle — 独立角色，永远不借用 display 角色
  subtitle:   { fontFamily: "'<Family1> Medium','<Fallback> Medium',sans-serif", px: 38, weight: 400, lineHeight: 1.5, tracking: "0.02em" }

spacing:
  # 画布 1920x1080；所有 frame-relative 单位都是 cqw/cqh —— 对 container-type: size 的 frame ground
  pad-x: "5.2cqw"          # 100px
  pad-top: "5.6cqw"        # 107px
  display-max-w: "82cqw"   # 唯一那行大字永远不到边
  display-band: "top 13cqh to bottom 78cqh"   # y 140 -> 842：display type / figure / diagram
  subtitle-band: "y 872 -> 1024, centred"     # 保留：任何别的东西不得进入
  chrome-top: "y 60 -> 120"                   # 只放 label 类 chrome

components:
  # 每一项写 rule（可判定）+ description（什么时候用）。只写好看的话等于没写。
  ground: { layers: "ground base -> one radial <regA-900> pool @ <=0.55 -> vignette (rgba(0,0,0,.72) edges) -> grain @ 4%", description: "每一帧都有。恰好 ONE 光池，逐帧摆位置 —— 它就是这场戏的主光。" }
  light-rays: { rule: "1-3 blurred linear-gradient wedges 从光池原点出发，opacity <= 0.10，blur >= 24px", description: "体积光柱。永远不硬边，永远不超过三条。" }
  bloom: { rule: "<regA> 元素拿到 drop-shadow(0 0 24px glow-accent) 加一个模糊的复制体 @0.35", description: "本片唯一的『发光』技术。只给当场戏 accent 的那个元素。" }
  specular: { rule: "linear-gradient(105deg, transparent, <regA-100> @ .55, transparent) 蒙在 <regA> 大字上，一次", description: "金属扫光。每次 reveal 一次，跟拍，永不循环。" }
  dust: { rule: "8-26 个模糊点，1-4px，<regA-300> @ .10-.45，两个 parallax 深度，缓慢漂移", description: "空气里的生命。每帧都跑；必须 seeded，绝不用 Math.random()。" }
  hairline: { rule: "1px，hairline（暖）或 hairline-cool（冷），永不更粗", description: "唯一的结构线。图表、坐标轴、分隔、刻度。" }
  <pictogram>: { rule: "共享 SVG，<描述构造 + 它继承哪套 ramp 的哪些档>；<regB-400> 表示 <含义 B> 状态", description: "本片的唯一图标。绝不逐帧重画。" }
  <data-primitive>: { rule: "<n> 个点落在 1px cool hairline 上；选中点 = <regA-500> 加 2px ring", description: "<它在片子里演的数学舞台：候选人、申请、麦穗……>" }
  figure-block: { rule: "figure type 用 <regA-500> + figure-sm 注释用 paper-muted，左对齐，无框", description: "屏幕上每一个数字。数字来自 data/*.json，绝不手打。" }
  subtitle: { rule: "1 或 2 行，subtitle type，paper，居中，压在底部 scrim 上", description: "只在底部保留带。永不压 display type —— 那条带是保留的。" }
  kicker: { rule: "label type，拉丁大写，<regA-700> on dark", description: "mono 眉标：帧号、英文术语、数据出处。" }
---

# <Theme Name> — Frame (video / frame layer)

## Overview

<!--
写清楚这部片必须用同一套视觉语言同时做到哪几件事（讲故事 + 讲一个定理 + 落到观众自己身上），
然后一句话给出答案。真实例子是「one ground, two registers, three type families」。
-->

答案就是 **一个 ground，<N> 个 register，<M> 个字体家族**。

- **一个 ground。** `{colors.ground}` → `{colors.ground-alt}` 的基底，压在**单个**光池下面。
  绝不纯黑：纯黑里没有留给暖光池的余地，而本片是被照亮的，不是平的。
- **<N> 个 register。** `regA` 永远表示 <含义 A>；`regB` 永远表示 <含义 B>。
  这个映射就是本片的论点，所以它绝不能是装饰：<举出真实的证据 —— 同一个图里哪两段
  一个用 regB 一个用 regA，或者哪个元素只在某个时刻换 register>。
- **<M> 个字体家族。** <家族1> 给 <层1>；<家族2> 给 <层2>；<家族3> 给 <层3>。
  <一句话：只看字体就能分辨片子的层>。

深度是**光，不是影**：bloom、一个光池、god rays、dust、一次金属扫光；画面其余部分是平的，
层级来自 scale、weight、register 和 1px hairline。

## The Frame

### Frame Craft Bar

进入任何结构检查之前，四条肉眼测试先卡每一帧：

- **Light** — 是不是恰好**一个**光源，画面读起来像被它照亮？失败长得像均匀亮度，或者三个互相打架的光池。
- **Squint** — 是不是**只有一个 display moment**，在 3–6× 上压过其他一切？没有别的东西跟它争。
- **Silence** — 陈述帧读起来 **45–55% 是空的**（目标 ~50%）。只有数据帧允许密。
- **Register** — regA 表示 <含义 A>，regB 表示 <含义 B>。一个不表达任何含义的 regA 元素是 bug。

- **Primary and only:** <1920×1080>。字体在 px 上对这块画布授权。
- **Container law（承重）。** 每个 frame ground 设 `container-type: size`，所有 frame-relative 布局
  用 `cqw`/`cqh` 对它计算 —— **绝不用 `vw`**；1px hairline 保持 1px。

### The reserved bands (hard rule)

<!-- 这四条数字不要改。它们是几何，不是风格。 -->

- `{spacing.display-band}` — **y 140 → 842** — display type、figure、diagram 只能活在这里。
- `{spacing.subtitle-band}` — **y 872 → 1024** — 只属于字幕轨。**任何 display type、figure、
  pictogram、chart 不得进入，任何字幕不得离开。** 这是「字幕不遮挡动画」的结构性保证。
- `{spacing.chrome-top}` — **y 60 → 120** — 只放 label / mono 类 chrome。
- **y 842 → 872 是 guard（30px）** — 保持干净：暗的图形层（字幕 scrim 下的剪影）可以穿过，亮的不行。

## Colors

<!-- 两个 ramp，每个只有一个含义，外加一组纯文字色。 -->
**`regA-500` 是 accent；`regA-100` 只做 specular（catchlight、扫光峰值），永远不做填充。**
**`regA-900` 是结构** —— 网格线、光池自身的颜色、黑底上的暗 <regA>。`regB-400` 是 pictogram 与
区间在 <含义 B> 状态下的默认色。

- 同一 register 内的强调是 **scale、weight、opacity** —— 永远不是新色相。
- <如果片子里有"错误/正确"的语义：不要红绿。真实例子把 63% 的失败率画成 dim <regA> 而不是
  警报红 —— 片子的论点是"错过是正常的，不是紧急情况"。>

## Typography

<!-- 每个内容层一个家族；写清为什么这个映射是可辩护的，不是装饰性的。 -->

- **字重家族按安装名精确写出**（`<Family> Black`、`<Family> SemiBold`）。Windows 把它们暴露成
  独立家族；只写基础家族再要求 `font-weight: 900` 会**合成**假粗体。绝不这么做。
- **CJK display 的 tracking 保持接近零**（`0.005em`）：笔画需要它的字怀。负 tracking 是拉丁文的
  动作（`-0.02em`…`-0.04em`），不要用在 CJK 上。
- **Fit-to-measure。** 每帧一个 display moment，上限 `{spacing.display-max-w}`（82cqw）。
  <给出你的阶梯，例如：≤6 个汉字 → display-lg；7–12 → display；13–20 → h1；整句 → h2/body。>
- **数字永远用 mono。** 观众需要记住的任何数字都用 `{typography.figure}` 或 `{typography.figure-sm}`
  —— 绝不用 sans。mono 是本片对"这个数字算过"的承诺。
- **subtitle 是独立角色** —— 为了"让它跳出来"把字幕设成 display 家族是禁止的。

## Depth & Surface

唯一的深度技术是**光**：

- **一个光池** —— `radial-gradient`，`regA-900` 系 @ ≤0.55，逐帧摆位置当主光。
- **God rays** —— 从光池出发的 ≤3 条模糊楔形，opacity ≤0.10。
- **Bloom** —— 只给那个 accent <regA> 元素：`drop-shadow(0 0 24px glow-accent)` + 模糊复制体。
- **Specular sweep** —— 一次蒙版过的 `regA-100` 扫过 <regA> 大字，跟拍，一次。
- **Dust** —— 8–26 个模糊尘埃，两个 parallax 深度。位置 seeded；这是片子的"灵动"。
- **Grain** —— 4% 覆盖层，逐帧静态。它让黑不会 banding。
- **Vignette** —— 边缘到 `rgba(0,0,0,.72)`。

**Ceiling：** 不许第二个光池，不许用 drop shadow 当 elevation，不许 bevel，不许 3D extrude，
不许给卡片加 `box-shadow`（用 hairline 和光池代替）。

## Shapes

- 每个矩形 **0 radius**：卡片、面板、条、图表里的 ring。圆是真的圆。
- 面板要么 **hairline 包边，要么无边框**；要填充就用 `ground-raised` @ ≤0.6，绝不用中灰，
  绝不用 <regA> 填充（除了那唯一一个"选中"时刻）。

## Components

`ground` · `light-rays` · `bloom` · `specular` · `dust` · `hairline` · `<pictogram>` ·
`<data-primitive>` · `figure-block` · `subtitle` · `kicker`。

<!-- 只列真实存在的。每个组件都要能在 frontmatter 的 components 里找到同名的 rule。 -->

## Composition Rules

### Do

- 每帧只从**一个**方向打光，并且让光池看得见。
- 让 **regA = <含义 A> / regB = <含义 B>** 的映射在每一帧都字面成立。
- 把**每一个数字**放进 mono，并且能追到 `<data-file-1>` / `<data-file-2>`。
- 所有 display type 留在 `{spacing.display-band}`，所有字幕留在 `{spacing.subtitle-band}`。
- 层级用 **scale 和 light** 搭，不用盒子和边；让陈述帧留 **~50% 空**，忍住别填。

### Don't

- 绝不纯黑 ground；绝不平的无光帧；绝不要第二个光池。
- 绝不用 `vw` 单位；绝不用 2px hairline；绝不用圆角卡片。
- 绝不引入第二个 accent 色相 —— <不要红/"错"，不要绿/"对"；用两个 register。>
- 绝不手打数字；绝不让一个数字没有出处文件。
- 绝不让字幕轨以外的任何东西进入 y 872 → 1024；绝不让字幕离开它。
- 绝不合成粗体字重；绝不给 CJK display 加负 tracking。

## Aspect-Ratio Behavior

<!-- 只写你真正授权的比例。授权一个比例就写一个 —— 不要给不存在的比例留投机性布局。 -->

只授权 **<1920×1080>**。9:16 和 1:1 不在范围内，任何帧都不该带竖直版的猜测性布局。

## Approved Entities

<!-- 品牌、真人、历史人物、素材照片：能出现什么、以什么形态出现。 -->

<例：没有 logo、品牌、客户或真人出现；历史人物只做**平面剪影** —— 没有五官、没有肖像权风险、
没有服装考据，只有一块袍形的体块。素材照片一律不用，图形由共享 SVG 承担。>

## Numerals & Claims (hard rule)

屏幕上的每一个数字都必须追到一个文件：

- `<data/….json>` — <列出它提供的每个数字>。
- `<data/….json>` — <同上>。
- <四舍五入的呈现形式（例如 37% / 36.8%）必须与源数字保持一致，并且写在这里。>
- **`<某个带出处的数字>` 是引用，不是计算** —— 它必须永远在下面用 `{typography.label}` 带上
  `<作者 (年份)>`。

数据帧里永远不接受占位符：一个数字没有出处，这一帧就不发。

## Pre-Render Self-Audit

- **Light** — 一个光池、看得见、和帧里每一次 bloom、每一条 ray 一致。
- **Register** — regA = <含义 A>，regB = <含义 B>；没有任何第三个色相。
- **Bands** — display type 在 y 140–842 内；字幕只在 y 872–1024 内；没有东西越界。
- **Type** — 每个内容层用对 register；字重家族名精确；只有一个 display moment；≤82cqw。
- **Depth** — 一个光池、≤3 条 rays、bloom 只给 accent、一次 sweep、dust seeded、grain 在。
- **Fabrication** — 每个数字都追到 `data/`，引用类数字带着它的出处。
- **Silence** — 陈述帧 ~50% 空；只有数据帧密。

## Known Gaps

- **动效不在这个文件的范围里。** 时间、缓动、跟拍和 accent 位置住在 `STORYBOARD.md`（bars + cues）
  和动画规则里；这个文件只规定构图。
- **字体是本地安装的**（<列出实际家族>）。渲染确定性、渲染时不取网络；换一台机器字体栈会退到
  系统 sans/serif，观感会退化。
- **<9:16 / 1:1 刻意不支持>** —— 见 Aspect-Ratio Behavior。
