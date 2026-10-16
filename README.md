# 麦穗 / vibe-editing

一个可复用的 AI-agent skill：把一段主题简报变成成片、封面、标题与简介。

> **一句话**：给它一个主题，它交付**成片 + 封面 + 标题 + 简介**。

它不是一个 prompt 模板，而是一条带脚本闸门的流水线：音乐先被测量，时间轴先被拟合，
画面按拍线生成，交付前每一项校验都要跑通。这份 skill 是从一次真实交付里蒸馏出来的——
下文所有数字都来自那次交付的产物，不是估算。

---

## 它能交付什么

| 交付物 | 说明 |
|---|---|
| 成片 | MP4，H.264，内含内嵌字幕与混音母带（BGM + 音效一次混好） |
| 封面 | 16:9（1920×1080）、4:3（1440×1080）、3:4（1080×1440），外加 B站推荐的 **1146×717** |
| 标题与简介 | B站与抖音两套，各自带标签、分区 / 话题、发布建议 |
| 全套校验报告 | 卡点、跨文件契约、静帧像素、开场姿态、混音响度——逐项落盘成 JSON |

封面四张共用同一套设计，缩到 240px 宽（B站网格瓦片大小）后文字仍可辨识，
四边 24px 内无内容，不会被平台裁切。成片字幕是分层的：底部小字承担语义、
中央大字承担重音——没有旁白，字幕就是声音。

---

## 它是怎么保证质量的

### 卡点是量出来的，不是对出来的

音乐不靠"感觉对拍"，先测出来再用：

- **脉冲先测量，再使用。** `scripts/hit-map.mjs` 用 STFT 频带通量找真实音头，
  再用**音头间隔（IOI）直方图**定出脉冲。自相关在这首曲子上给出 64.6 BPM——是错的（节拍歧义）；
  直方图给出的 **112.91 BPM / 0.53140 s** 才是真的。
- **网格拟合到真实瞬态。** `scripts/timing-map.mjs` 把拍网格对齐到音头：
  **303 拍中 204 拍命中真实音头，误差中位数 2.3 ms**；并判定为 **4/4**
  （四拍对比度 0.598，三拍 0.019）。小节 = 4 拍 = 2.1256 s，8 小节乐句 = 17.005 s。
- **镜头切点全部落在小节线**，字幕与音效落在拍线。
- **脚本断言，容差 15 ms。** `scripts/verify-timing.mjs` 重新检查上面三件事，
  再对**成品混音**做包络互相关，确认每条音效真的在它该在的位置上——
  写出来的时间不算数，混出来的才算。上一次交付的结果：切点 33/33（最差 0.5 ms）·
  字幕 41/41（最差 5.5 ms）· 音效 40/40（最差 1.7 ms）· 成品音频声学复核中位误差 **2.7 ms**。

### 其余闸门

| 闸门 | 脚本 | 拦什么 |
|---|---|---|
| 跨文件契约 | `verify-frames.mjs` | 合成 id 三处不一致、时长不对齐、字体块缺失、误用 `vw`/`vh`、混入随机数 |
| 静态结构 / 浏览器闸门 | `npx hyperframes lint` · `check` | 结构错误、运行时错误、版面越界、动效错误、对比度不达标 |
| 静帧像素体检 | `audit-still.mjs` | 逐张静帧的金色占比、留白、溢出等统计异常 |
| 开场姿态 | `frame-openings.mjs` | 每帧入场状态是否就是设计的那个状态 |
| 渲前帧闸门 | 成品回抽比对 | MP4 帧与合成静帧的逐像素统计是否一致 |

**这些校验证明了什么，要说明白**：它们证明**存在、几何与对比度**——元素在该在的位置、
在该在的时刻、有足够的可读性。它们**不证明好看**。审美判断交给人：
流水线会在出片前生成接触表，并要求人把静帧过一遍；人不点头就不渲染。

---

## 唯一一次实战交付

这套方法目前只跑通过一次，产物可以作为它能力边界的参照：

| | |
|---|---|
| 成片 | 161.03 s · 1920×1080 · 30 fps · H.264 · 约 4831 帧 |
| 音频 | AAC 48 kHz 立体声 · **−14.8 LUFS** · 峰值 **−1.7 dBFS** · BGM + 43 条音效 |
| 结构 | 33 个子合成 · 字幕双层（底部小字 + 中央大字）· 无旁白 |
| 渲染 | 硬件 GPU · capture 18m12s / assemble 3.2s |

那次简报是「用苏格拉底的麦穗寓言讲最优停止理论，受众是高中生与大学生」，
音乐由用户提供，时长由整首曲子决定、不做裁剪。本仓库的 `scripts/` 就是那次的工具集，
去掉了项目专属的部分、补齐了注释。

---

## 安装

### 方式一：作为 DSH skill 安装

把整个文件夹放进 skills 目录，agent 就会自动发现它：

```bash
git clone https://github.com/<you>/skill_vibe_editting.git
mkdir -p ~/.dsh/skills
cp -r skill_vibe_editting ~/.dsh/skills/vibe-editing
```

Windows（PowerShell，目录为 `C:\Users\<你>\.dsh\skills\`）：

```powershell
git clone https://github.com/<you>/skill_vibe_editting.git
New-Item -ItemType Directory -Force "$env:USERPROFILE\.dsh\skills"
Copy-Item -Recurse skill_vibe_editting "$env:USERPROFILE\.dsh\skills\vibe-editing"
```

复制完的入口是 `C:\Users\<你>\.dsh\skills\vibe-editing\SKILL.md`。
想跟着仓库更新，就别复制——用目录符号链接指向 clone 出来的目录：

```powershell
New-Item -ItemType SymbolicLink -Path "$env:USERPROFILE\.dsh\skills\vibe-editing" `
  -Target "<clone 路径>\skill_vibe_editting"
```

### 方式二：直接当仓库用

```bash
git clone https://github.com/<you>/skill_vibe_editting.git
cd skill_vibe_editting
```

然后从 `SKILL.md` 读起——它是入口，`references/` 与 `templates/` 由它按需指向。

### 外部依赖（诚实说明）

| 依赖 | 要求 | 备注 |
|---|---|---|
| Node.js | **22+** | 所有脚本都是 ESM，在 22 上验证通过 |
| FFmpeg | 在 `PATH` 上 | 抽取音频、混音、渲染封装都要它；`scripts/env.ps1` 负责把本机安装加进 `PATH` |
| HyperFrames CLI | `npx hyperframes@0.8.164` | skill 驱动它出片；渲染器首次运行会自行下载无头 Chrome（`chrome-headless-shell`） |

字体取自**本机已安装的字族**并做子集化。换一台机器，同样的代码可能落到不同的字体回退，
版面细节因此会有细微差别——交付前请在目标机器上重跑字体构建与静帧体检。

---

## 用法

用户写的是简报，不是命令。比如：

> 做一个 2 分钟的暗色解说，讲「沉没成本」，受众是刚工作的人，BGM 用我给的这首，
> 要 B站和抖音两套标题简介。

agent 拿到之后会做的事：

1. 问清缺口（时长、语言、投放尺寸、受众），把确认结果落成 `BRIEF.md`，然后**停下来等你确认**。
2. 测音乐、拟合拍网格，出 `hit-map.json` / `timing-map.json`。
3. 按拍网格切分镜、写故事板 `STORYBOARD.md`，**再停下来等你确认文案**。
4. 定设计系统与字体子集，逐帧构建画面，混音，跑完全部校验。
5. 生成接触表交给你过目；通过后才渲染，最后产出封面与两个平台的文案。

产出落位：

```text
<project>/renders/video.mp4         成片
<project>/covers/*.png              四张封面
<project>/PUBLISH.md                B站 / 抖音两套标题与简介
<project>/audio/*-report.json       校验与混音报告
```

### 流水线阶段

| 阶段 | 名字 | 主要产出 |
|---|---|---|
| 0 | 环境 | FFmpeg / Node / CLI 就位，`env.ps1` 通过 |
| 1 | 听音乐 | `hit-map.json`——真实音头、脉冲候选、BPM |
| 2 | 时间轴 | `timing-map.json`、`scene-grid.json`——拍网格、小节线、分镜切点 |
| 3 | 设计系统 | `frame.md`——色板、字体语域、光影、保留带、禁用项 |
| 4 | 字体 | 子集化 woff2 + `fonts.css`（只保留屏上真正用到的码位） |
| 5 | 故事 | `STORYBOARD.md` 与逐帧指令包——文案、字幕、时值、数据出处 |
| 6 | 声音 | 音效映射、`mix.wav` 母带、逐条许可记录 |
| 7 | 画面 | 每帧一个子合成 + `index.html` 根时间轴 |
| 8 | 校验 | 上表全部闸门 + 成品声学复核 |
| 9 | 发布物料 | 四张封面 + B站 / 抖音标题、简介、标签 |

想手动重跑某一段，脚本都可以单独执行。它们从**项目根**启动，
向上查找 `vibe.config.json` 来定位 `audio/`、`assets/`、`renders/` 这些目录，
所以命令要在项目根里跑：

```bash
node <skill>/scripts/timing-map.mjs      # 拟合拍网格 -> audio/timing-map.json
node <skill>/scripts/verify-timing.mjs   # 卡点断言 + 成品混音复核，失败以非零码退出
```

`verify-timing.mjs` 是改动任何与时间相关的东西之后**必须**重跑的脚本：
它同时检查数据层与成品音频层，偏差超过 15 ms（音效按声音形状放宽到 25–80 ms）就以非零码退出。

---

## 目录结构

```text
SKILL.md                 入口：什么时候用、按什么顺序做、每个阶段交给哪个 reference
vibe.config.json         项目根标记：脚本向上查找它来定位 audio/、assets/、renders/
references/
  pipeline.md            九个阶段的详细步骤与人工确认点
  timing.md              音乐测量与拍网格拟合的完整方法（含容差与验收标准）
  design-system.md       暗色电影感设计系统的取值方式与禁用项
  verify.md              每个闸门查什么、阈值多少、失败怎么修
  publish.md             B站 / 抖音的标题、简介、封面与发布规则
templates/
  BRIEF.md               简报模板（意图 / 素材 / 定制项 / 约束）
  STORYBOARD.md          逐帧故事板模板
  BUILD-RULES.md         每帧构建者必须遵守的契约
  packets/FNN.md         逐帧指令包模板
scripts/                 全部闸门与构建脚本
  hit-map.mjs            STFT 音头检测 + IOI 直方图定脉冲
  timing-map.mjs         拍网格拟合、拍号判定、小节 / 乐句网格
  verify-timing.mjs      卡点断言 + 成品混音声学复核（容差 15 ms）
  verify-frames.mjs      跨文件契约：id / 时长 / 字体 / 单位 / 随机数
  coverage-map.mjs       成片逐秒扫描：该有字的地方真的有字吗
  frame-openings.mjs / audit-still.mjs        开场姿态与静帧像素体检
  build-fonts.mjs / inject-fonts.mjs          字体子集化与内联
  build-frame-packets.mjs / build-index.mjs   逐帧指令包与根时间轴
  build-sfx-map.mjs / prep-sfx.mjs / mix-soundtrack.mjs   音效映射、归一与母带
  build-covers.mjs / audit-covers.mjs         四张封面与缩略图可读性审计
  fetch-sfx.mjs / plan-scenes.mjs             音效获取与许可、小节网格上求解切点
  decode-track.mjs / hit-map.mjs              音乐解码、音头检测与音头间隔直方图
  compute-optimal-stopping.mjs / compute-life-window.mjs   数据计算（按主题替换的示范）
  sync-storyboard-timings.mjs                 由 bars + 文案反推字幕时间并过阅读速度闸门
  probe-m4a.mjs / fix-titles.mjs / env.ps1 / lib/vibe-config.mjs   工具与环境
  selftest.mjs            合成一条已知 BPM 的节拍轨，验证整条测量链
```

维护者工具（不随 skill 安装到用户项目）：

```
maintainer/check-links.mjs       文档里引用的每个路径是否真的存在
maintainer/publish-github.mjs    通过 GitHub REST API 发布（git push 不可达时也能用）
```

---

## 它不适合什么

- **不适合真人出镜素材。** 这条流水线做的是无素材的图形解说（faceless explainer），
  画面由 HTML/CSS/SVG 现场生成。已有口播视频要加字幕或做包装，应该用别的 workflow。
- **不是通用剪辑软件。** 它不帮你剪 vlog、不做多机位、不做调色台。
  它的假设是"从零生成一支片子"，不是"编辑已有素材"。
- **卡点方法需要音乐有脉冲。** 如果曲子没有稳定脉冲（纯环境音、自由节奏、无鼓点），
  流水线会如实报告无法拟合拍网格，并退回按内容节奏切分的模式——
  这时"卡点"不再是硬保证，只有字幕与音效的位置仍然可校验。
  没有音乐时它会先问你要不要生成一条，而不是假装有拍可卡。
- **不是一键生成器。** 它是一条分阶段流水线，带人工确认点：
  agent 会让你先确认内容脚本，再在渲染前请你过一遍静帧。
  这两次介入是设计的一部分，不是流程缺陷。
- **还没有第二个主题的实战记录。** 方法本身是通用的，但换一个主题会遇到什么，
  这套 skill 尚未验证过——这是它的第一次蒸馏。

---

## 许可与致谢

- 本 skill 采用 **MIT** 许可。
- 它驱动的框架是 **HyperFrames**（Apache-2.0），HTML → 视频的渲染与校验由它完成。
- 第三方音效各自带自己的许可，**不是统一的 CC0**。流水线会逐条记录来源与许可
  （`audio/sfx-licenses.json`），替换音效时请连同许可记录一起换。
- 字体是**本机字族的子集**，字体本身的许可随字族而定，不由本仓库授予。
