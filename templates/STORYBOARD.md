---
format: <1920x1080>
duration: <161s>
message: "<一句话主张，与 BRIEF.md 完全一致>"
arc: <结构名，例如 story-explainer 承载 concept-explainer>
audience: "<受众，与 BRIEF.md 一致>"
mode: <collaborative>
workflow: <faceless-explainer>
music: <mood 描述，或 none>
---

<!--
FRONTMATTER 键（写成一行一个 `键: 值`，不要在这段 YAML 里加行内注释 —— 读取器是逐行
`key: value` 解析，行内注释会被当成值的一部分）：

  format      画布尺寸，与 BRIEF.md 的 aspect 一致
  duration    从 BRIEF.md 的 length 抄来；是预期而不是闸门，实际落点由音频决定
  message     一句话主张；与 BRIEF.md 不一致时以 BRIEF.md 为准（它记的是用户确认过的）
  arc         结构名；复合结构写 `<外层> with <内层>`，要显式命名
  audience    受众，与 BRIEF.md 一致
  mode        collaborative | autonomous，由 flow × storyboard 派生，不要自己发明
  workflow    执行本片的工作流；未知键（这个和 music）会被原样保留在 globals.extra
  music       BGM 情绪串；由用户提供 BGM 时写 none（= 不自动取曲），音频资产记进 BRIEF.md 的 ## Assets

TIMING BIBLE — 由音频实测得出，写在这里的是人和脚本共用的同一份事实（细节见 audio/timing-map.json）

  tempo       112.91 BPM      beat 0.53140 s       offset 0.4163 s
  meter       4/4             bar 4 beats = 2.1256 s      bar n 从 offset + 2.1256n 开始
  grid fit    204/303 拍落在真实音头上，误差中位数 2.3 ms

  规则（不要违反）：

  1. 场景边界只落在 **BAR 线**上 —— 每一个切点都是音乐的重拍（downbeat）。
  2. 动画重音与字幕 cue 只落在 **BEAT 线**上。
  3. 你写的只有 `bars`。`start` / `end` / `duration` / `cues` 是**脚本注入的派生键**：
         node scripts/sync-storyboard-timings.mjs
     这四个键每次全量重建，**永远不要手改**（手写 cue 时间必然漂移）。
  4. `scripts/verify-timing.mjs` 会拿音频重新断言第 1、2 条，容差 15 ms。
  5. 场景长度用 2 小节或 4 小节；需要一记短拳时才用 1 小节
     （真实影片第 27 帧的年龄揭示只占一个小节：2.13 s）。
  6. `bars` 是小节序号，写成 `a–b`（占第 a 到第 b 小节）；`beat` 字段是拍线落点，不是小节。
-->

<!-- 下面两帧取自真实影片，用作格式与颗粒度的参照；换成你自己的帧时把 src 和正文一起改掉。 -->

## Frame 3 — 它永远在前面一点

- scene: 镜头贴近那条标准线，线下方密集的光点全部压在同一个高度上，一齐向上跳了一下又落回。
- shot: 标准线特写 · 光点齐跳 · 定格在"差一点"
- bars: 6–8
- start: 13.170
- end: 17.421
- duration: 4.25s
- transition_in: cut
- status: outline
- src: compositions/frames/03-almost.html
- type: pain_point
- persuasion: 压缩成一句（Distillation）
- beat: 认命的好笑
- voiceover: 它永远在你前面一点。
- display: 「差一点」三字被标准线反复擦过
- cues: 13.7–17.24 它永远在你前面一点。

narrativeRole: 把 Act I 收成一个可以笑一下的结论，为麦田的类比腾出位置。
keyMessage: 你的标准总会比现实高一点。

## Frame 22 — 36.8%

- scene: 右侧图表区开始跑蒙特卡洛：细密柱子一条条落下累积，曲线爬升并在 37% 处形成明显的峰。大数字从 0 数到 36.8%，随后左侧出现对照条：随机 1% / 37% 法则 36.8%。
- shot: 蒙特卡洛柱状累积 · 曲线成峰 · 数字数到 36.8% · 对照条出现
- bars: 50–54
- start: 106.696
- end: 115.199
- duration: 8.50s
- transition_in: cut
- status: outline
- src: compositions/frames/22-368.html
- type: social_proof
- persuasion: 统计证明（当场演示，不引用）
- beat: 信服 + 一点震撼
- voiceover: 这样做的胜率是 36.8%。 ｜ 随便选一个，只有 1%。
- display: 大数字 36.8% 与 1/e；对照条 1% vs 36.8%，倍率「37×」作为大字（不作为字幕）
- data: data/optimal-stopping.json — n=100 精确最优 r=38（先拒 37），P=0.371043；1/e=0.367879；蒙特卡洛 20 万次，固定种子，与公式吻合
- cues: 107.23–111.4 这样做的胜率是 36.8%。 · 111.48–115.02 随便选一个，只有 1%。

narrativeRole: 用当场跑出的模拟替掉所有"据说"，让结论具备可复核性。
keyMessage: 37% 法则把胜率从 1% 提到 36.8%，差 37 倍。

## 后续帧骨架

<!--
复制下面这一段，`<...>` 全部替换，`N` 换成实际序号；帧标题行写成 `## Frame N — 短标题`。
每一帧都长这个样子，除标注（派生 / 可选）的键以外都是必需的：

- scene: <一句话画面想法，不是构图说明书：这一格看到什么、它在动什么；连续段落要在 scene 里重复同一个舞台>
- shot: <一句话镜头：机位/运动 + 主体 + 收尾状态，给建帧的人当施工顺序>
- bars: <起始小节–结束小节，例如 8–12；长度取 2 或 4 小节，短拳才用 1 小节>
- start: <派生键：由 sync 脚本注入，不要手写>
- end: <派生键：由 sync 脚本注入，不要手写>
- duration: <派生键：由 sync 脚本注入，不要手写>
- transition_in: <注册表里的转场名：cut | crossfade | blur-crossfade | push-slide LEFT/RIGHT/UP/DOWN | zoom-through | squeeze；全片只挑 2–3 种，第 1 帧用 cut>
- status: <outline | built | animated；新建帧一律 outline，布局确认后 built，动效做完才 animated>
- src: <compositions/frames/NN-short-name.html，与帧号同名，方便对照>
- type: <hook | pain_point | product_intro | feature_showcase | benefit_highlight | social_proof | branding | cta —— 与下游视觉层共用的枚举，按讲解角色复用，见 references/05-story.md>
- persuasion: <一个有名字的技巧，不是"讲解一下"：具体化 / 渐进披露 / 对照 / 规则三分 / 统计证明 / 引用 / 演示 / 因果链 / 命名 / 呼应开场 / 蒸馏成一句 …>
- beat: <目标感受，一个词或短复合词：被说中 / 会心的无奈 / 犹豫 / 信服 + 一点震撼 / 清醒 / 释然 …>
- voiceover: <字幕台词，用「｜」切成两条或更多 cue；静默帧留空，此时由 persuasion 与 narrativeRole 扛住这一帧>
- display: <中央大字写什么、按哪几拍落、和字幕怎么分工；不要重复字幕原文；确实不需要时写"无大字"并说明留白原因>
- data: <可选：这一帧每个数字的来路 —— `data/<file>.json — 怎么算的`，或 `来源：<作者> (<年>), <期刊> <卷(期)>:<页>`>
- poster: <可选：接触表取这一帧的哪一秒作封面帧（避开展开动画）>
- cues: <派生键：由 sync 脚本注入，不要手写>

narrativeRole: <这一帧在观众的理解里干什么 —— 不是"展示一个图表"，而是"把复利具体成一场雪球">
keyMessage: <观众看完这一帧应该懂的那一件事，一句话>
-->
