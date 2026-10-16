---
name: vibe-editing
description: 把一段主题说明做成一整包发布物料：卡点动画解说成片 + 多比例封面 + 平台标题简介。主题、受众、音乐由用户给，技术方法固定——先测量音乐（音头间隔直方图定脉冲，不用自相关），把镜头切点钉在小节线、字幕与音效钉在拍线，用脚本逐条校验后再渲染。Use when asked to make a beat-synced animated explainer video from a topic, brief, article or script — especially when the user supplies a music track and also wants covers, titles and descriptions for platforms like Bilibili, Douyin, YouTube or X.
---

# vibe-editing

**主题你定，方法固定。** 用户给主题、受众、以及（可选）一首音乐；你交付成片、封面、标题与简介，
以及能证明它合格的那套校验报告。

这个 skill 的价值不在"能生成动画"，而在**每一步都可被脚本证伪**：脉冲是量出来的，
切点在网格上，字幕有阅读速度闸门，音效位置在成品音频里复核过，封面缩到 240px 还能读。

---

## 0. 先读什么

按顺序读，不要跳：

| 顺序 | 文件 | 为什么 |
|---|---|---|
| 1 | `references/00-intake.md` | 怎么接需求：什么必须问、什么不能问、什么时候停下来等人 |
| 2 | `references/01-audio-truth.md` | 测量音乐的唯一正确方法（自相关会给出错的 BPM） |
| 3 | `references/02-timing-bible.md` | 切点在小节线、字幕音效在拍线，以及时间怎么推导 |
| 4 | `references/03-design-system.md` | 为**新主题**写 `frame.md`：一个地面、一个光源、两个语域、三套字 |
| 5 | `references/05-story.md` | 讲解片的叙事：论点、钩子、把抽象落到观众身上 |
| 6 | `references/06-sound.md` | 音效来源与许可、按物理位置摆 cue、混成一个母带 |
| 7 | `references/07-frames.md` | 一帧一个子合成：包件、并行构建者、生成式 index |
| 8 | `references/08-verification.md` | 每一道闸门、阈值、以及它**证明不了**什么 |
| 9 | `references/09-publish.md` | 封面与平台文案 |
| — | `references/99-pitfalls.md` | **出问题时第一个查这里。** 34 个真实故障的目录 |

模板在 `templates/`，脚本在 `scripts/`。

---

## 1. 铁律

违反任何一条都会以"检查全绿、成片是坏的"这种方式失败。细节见 `references/99-pitfalls.md`。

1. **音乐先量，再排片。** 用音头间隔直方图定脉冲。自相关在节拍歧义的音乐上会给出错的 BPM
   （真实案例：报 64.6，实际 112.91）。网格必须用「多少拍命中真实音头 / 中位误差」自证。
2. **镜头切点只落在小节线；字幕与音效只落在拍线。** 容差 15 ms，由脚本断言。
3. **字幕时间绝不手写。** 由 `bars:` + 文案推导；文案改动后重跑推导脚本。
4. **字幕要过阅读速度闸门**（≤6.5 字/秒）。超了改文案或给更多小节，不硬压。
5. **屏上每个数字要么当场算、要么带出处。** 不许编。引用型数字必须把出处打在画面上。
6. **一个地面、一个光源、两个有含义的语域。** 颜色不能是装饰：金=被选中/现在，冷灰=未观察/错过。
   不要用红绿表示对错。
7. **保留带是结构，不是约定。** 大字在 y 140–842，字幕独占 y 872–1024，y 842–872 是隔离带。
8. **一帧一个子合成，所有东西放进 `<template>`；合成 id 三处必须一致。**
   不一致时运行时每个场景空等 45 秒，然后截静态帧——片子长度正常，但完全不动。
9. **确定性。** 不用 `Math.random()`、不用 `Date.now()`、渲染时不取网络。随机用种子。
10. **第三方素材的许可如实记录。** 逐条写进台账，不要把非 CC0 的东西写成 CC0。

---

## 2. 工作流

九个阶段。每个阶段末尾有 gate；`[人]` 标的是必须停下来等用户的地方。

### 阶段 0 · 环境与立项

先确认工具链真的在，再动手：

```bash
npx --yes hyperframes doctor      # 要看到 Chrome 缓存 ✓ 与 FFmpeg ✓
node -v                           # 需要 22+
```

Chrome 缓存不在、FFmpeg 不在 PATH（winget 装完后**已经在跑的 shell 看不到**），
都先解决再往下走——否则会在渲染那一步才发现。

立项：

```bash
node tools/init-project.mjs --dir <工作目录> --slug <kebab-case 名> --track <音乐文件> --title "<工作标题>"
```

它会建好目录、写 `vibe.config.json`、**探测本机可用字体**（这是唯一真正依赖机器的输入）、
初始化 HyperFrames 工程、放入模板与起手视觉库。

> 注意：`npx hyperframes` 内部会用 git 拉取 skill，机器上残留的 `http.proxy` 指向一个没开的代理时
> 它会失败，而 npm 本身正常。诊断：`git -c http.proxy= -c https.proxy= ls-remote <url>`。

**Gate:** `vibe.config.json` 存在，六个字体角色都解析到了文件，`hyperframes doctor` 全绿。

### 阶段 1 · 音乐真相

```bash
node tools/decode-track.mjs     # → audio/track-info.json + audio/bgm-mono.wav
node tools/hit-map.mjs          # → audio/hit-map.json   音头 + 音头间隔直方图
node tools/timing-map.mjs       # → audio/timing-map.json 拍/小节网格 + 结构
```

看三件事：**脉冲候选是否互为整数倍**、**4/4 与 3/4 的对比度**、**多少拍命中真实音头及中位误差**。
三项都对不上就说明这首音乐没有可用脉冲——那就只按音头切，不要假装有网格。

**Gate:** `timing-map.json` 里的 `gridFit` 可信（真实案例：303 拍中 204 拍命中，中位误差 2.3 ms）。

### 阶段 2 · 把节奏钉下来

先定场景长度（单位是**小节**，不是秒），再写 `STORYBOARD.md`：

```bash
node tools/plan-scenes.mjs           # 打印小节网格与候选切点；有 scene-plan.json 就按它算
node tools/sync-storyboard-timings.mjs   # 由 bars + 文案推导每条字幕时间，并做阅读速度体检
```

`sync-storyboard-timings.mjs` 会写回 `start/end/duration/cues` 四个键——**这四个键是脚本生成的，
永远不要手改**。

**Gate:** 阅读速度零违规；每个镜头切点都在小节线上。

### 阶段 3 · 设计系统与字体

按 `references/03-design-system.md` 把 `templates/frame.md` 填成这一部片的 `frame.md`：
选一个地面、一个光源、两个有含义的语域、三套字域、保留带、禁用清单。

字体必须**子集化并内联**——命名了字体族却没有文件内的 `@font-face` 会被 lint 拒绝，
而外链 CSS 里的 `@font-face` 编译器看不见：

```bash
node tools/build-fonts.mjs      # 按本片用到的码位裁切 → assets/fonts/*.woff2 + fonts.css
node tools/inject-fonts.mjs     # 把 @font-face 内联进每一帧（build-index 也会自动先跑一次）
```

**Gate:** 六个 face 都有文件且尺寸合理（真实案例：6 个 face 共 588 KB）。

### 阶段 4 · 故事

按 `references/05-story.md` 写 `STORYBOARD.md`。然后 **`[人]` 停下来**。

把方案当**提案**递出去，不要当清单：先用一句话说「这部片告诉<受众>：<论点>」，
再用一张表逐帧说明（帧 / 类型 / 时长 / 画面上是什么 / 这一帧在故事里干什么）。
问用户：通过，还是要改哪几帧。

这一步的成本是 30 秒；等画面做完再改同一帧，成本是几十分钟。

### 阶段 5 · 声音

```bash
node tools/fetch-sfx.mjs catalogue            # 编目可达的免费音效（记录许可）
node tools/fetch-sfx.mjs download <id...>
node tools/prep-sfx.mjs                       # 去首尾静音、8ms 淡入淡出、归一、48kHz
#   然后写 <root>/sfx-design.mjs —— 你的声音设计（templates/sfx-design.mjs 是形状说明）
node tools/build-sfx-map.mjs                  # 校验每条 cue 的长度并报告与拍线的偏差
node tools/mix-soundtrack.mjs                 # 混成一条母带 → assets/audio/mix.wav
```

音效**按物理位置**摆放，不按感觉：whoosh 居中在切点上，riser 结束在揭晓拍，重音/咔哒的起音在拍上，
长床铺在一个区段下。摆在哪个时间点由画面的实际重音决定，不要按"每 8 拍一条"这种猜法
（真实事故：第三条规则音效因此落到了该帧结束之后）。

母带目标是 **−14 LUFS ±1**、真峰值 ≤ −1 dBFS。**不要**给一个已经压得很狠的母带再加压缩器——
只会泵；用 `alimiter` 时把 attack 调到 1 ms 并关掉自动增益，否则瞬态会顶到 0 dBFS。

**Gate:** `mix-report.json` 的响度在目标带内；所有 cue 长度合法。

### 阶段 6 · 画面

```bash
node tools/build-frame-packets.mjs    # 一帧一个指令包（含绝对时间 → 帧内时间的换算）
node tools/build-index.mjs            # 组装 index.html（会先注入字体；只挂已存在的帧）
```

一帧一个构建者，并行。每个构建者只拿到四样东西：`BUILD-RULES.md`（构建契约）、
它自己的包件、设计规范、共享库 + 参考帧。规则：**只改自己那一个文件、不要跑渲染器**
（校验集中在编排者这边跑）。

**Gate:** 全部帧通过 `verify-frames.mjs`。

### 阶段 7 · 校验

按 `references/08-verification.md` 的顺序跑，全部是脚本，不要靠眼睛替代：

```bash
node tools/verify-frames.mjs                 # 跨文件契约：id 三处一致、时长、字体块、单位…
npx hyperframes lint                         # 静态结构
npx hyperframes check --samples 3            # 浏览器闸门（长片要降采样数，否则会超时）
node tools/coverage-map.mjs --every 1.0      # 成片逐秒扫描：该有字的地方真的有字吗
node tools/verify-timing.mjs                 # 卡点：数据层 + 成品音频的声学复核
node tools/frame-openings.mjs --times        # 打印取样时刻
#   npx hyperframes snapshot --at <时刻> --no-end
node tools/frame-openings.mjs --check <快照目录>   # 开场姿态是否正确
node tools/audit-still.mjs <快照目录>         # 静帧像素体检
```

两个必须记住的陷阱：**lint 有 error 时版面与对比度审计会被关掉**，
输出会显示 `0 issue(s) across 0 sample(s)`——看起来干净，其实什么都没跑。
另外 `check` 在 30+ 场景的长片上用默认采样数会超时，用 `--samples 3`，那不是内容缺陷。

**第三个陷阱，也是最贵的那个：`check` 的采样点太少，会整整漏掉一个坏帧。**
参考影片在 161 秒 / 33 帧上跑 `--samples 9` 是"通过"的，但 F5 有三个字被 mask 掉、
连续 5 秒不可见——9 个采样点根本没落进那一帧里。`coverage-map.mjs` 就是为此存在的：
它沿成片每隔 N 秒量一次大字区的墨迹，并与每帧自己声明的 `accents/FNN.json` 对齐。
**它只能在有 `text: true` 标注时才给出确定判断**；没有标注的帧只会被列进"值得人看一眼"，
因为一个坏帧和一个正常的三秒铺垫在像素上无法区分。

### 阶段 8 · 出片

```bash
npx hyperframes render --quality delivery --output renders/video.mp4
```

渲染完**必须回抽验证**：`ffprobe` 看流与时长、`ebur128`+`volumedetect` 看响度、
用 ffmpeg 从成品 MP4 里抽几帧再跑一次 `audit-still.mjs`——证明文件与设计一致。

**Gate:** 抽帧体检与静帧体检结论一致（真实案例：金色占比 3.069% vs 3.066%）。

### 阶段 9 · 发布物料

```bash
#   填 <root>/cover-copy.json（一个数字 + 片名 + 一句钩子）
node tools/build-covers.mjs      # 多比例封面（含平台推荐尺寸）
node tools/audit-covers.mjs      # 含「缩到 240px 还读得到吗」这一项
```

再按 `references/09-publish.md` 写标题与简介：B站要数字进标题、简介带章节时间轴；
抖音要把问题或数字放进前 15 个字、正文短、5–8 个话题标签。

**最后 `[人]` 再看一次**：把成片关键帧、封面、标题简介一起交出去，问「就这样发，还是改哪里」。

---

## 3. 两个（实际是三个）人类闸门

脚本能证明**存在、几何、对比度、时间**；证明不了**好看、有品味、故事是否打动人**。
所以审美判断必须交回给人，而且要在便宜的时候交：

| 闸门 | 什么时候 | 让用户判断什么 |
|---|---|---|
| 内容稿 | 阶段 4 末，画面开工前 | 文案、结构、论点、时长 |
| 静帧 | 阶段 7 中途，渲染前 | 构图、字号、配色、是否遮挡 |
| 成片 | 阶段 9 末 | 整体节奏、卡点手感、要不要改 |

如果你看不到图片（很多模型不能），**如实说出来**，并改用可量化的检查交差，
再把静帧/接触表交给用户过目——不要用"校验通过"冒充"好看"。

---

## 4. 脚本清单

| 脚本 | 作用 |
|---|---|
| `scripts/init-project.mjs` | 立项：目录、配置、字体探测、HyperFrames 初始化、模板 |
| `scripts/decode-track.mjs` | 音乐 → 可分析的 WAV + 容器信息 |
| `scripts/hit-map.mjs` | 音头检测、音头间隔直方图、能量曲线、结构边界 |
| `scripts/timing-map.mjs` | 拟合拍/小节网格、判定拍号、打印响度弧 |
| `scripts/plan-scenes.mjs` | 在小节网格上选场景边界 |
| `scripts/sync-storyboard-timings.mjs` | 由 bars + 文案推导字幕时间；阅读速度闸门 |
| `scripts/build-frame-packets.mjs` | 一帧一个指令包（绝对时间 → 帧内时间） |
| `scripts/build-fonts.mjs` / `inject-fonts.mjs` | 子集化字体并内联 @font-face |
| `scripts/build-index.mjs` | 生成 index.html：挂帧 + 挂混音母带 |
| `scripts/fetch-sfx.mjs` / `prep-sfx.mjs` | 音效编目/下载（记许可）、去静音归一 |
| `scripts/build-sfx-map.mjs` | 由 `sfx-design.mjs` 生成并校验 cue 表 |
| `scripts/mix-soundtrack.mjs` | 混成一条母带并测量 |
| `scripts/verify-frames.mjs` | 跨文件契约闸门 |
| `scripts/coverage-map.mjs` | 成片逐秒扫描：该有字的地方真的有字吗（唯一能抓到"整帧静默失效"的闸门） |
| `scripts/verify-timing.mjs` | 卡点断言 + 成品音频声学复核 |
| `scripts/audit-still.mjs` | 静帧像素体检 |
| `scripts/frame-openings.mjs` | 开场姿态检查（`immediateRender` 陷阱检测器） |
| `scripts/fix-titles.mjs` | 修复未闭合的 `<title>`（会让整帧失效） |
| `scripts/build-covers.mjs` / `audit-covers.mjs` | 多比例封面 + 缩略图可读性校验 |
| `scripts/compute-optimal-stopping.mjs` / `compute-life-window.mjs` | 「数字当场算」的示范 |
| `scripts/lib/vibe-config.mjs` | 所有脚本共用的配置与路径解析 |

---

## 5. 用户该怎么向你提需求

一句话版本就够，缺的你会按 `references/00-intake.md` 问：

> 做一个约 2 分半的暗色解说，讲「沉没成本」，受众是刚工作一两年的人，
> BGM 用我给的这首，不要旁白，要 B站和抖音两套标题简介。

解析出来是：主题=沉没成本 · 论点=（待你提两个角度让他选）· 受众=职场新人 ·
时长=用满音乐 · 旁白=无（字幕即声音）· 平台=B站+抖音。

**主题决定内容，方法不变。** 只要用户没有明确要求换方法，就按本文的九个阶段走完。
