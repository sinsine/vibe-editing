# 02 · 时间圣经：让每一帧都长在音乐上

`01-audio-truth.md` 把网格测出来了。这一篇讲怎么**用它**：镜头切点、字幕时间、音效落点、版面保留带、以及验收。核心只有一条规则，其余全是它的推论。

数字来自那部 161.017 s 成片：`beat = 0.5314 s`、`offset = 0.4163 s`（112.91 BPM）、`bar = 4 拍 = 2.1256 s`、`8 小节乐句 = 17.005 s`。命令按 `node tools/<script>.mjs` 写（本 skill 的脚本放在项目的 `tools/`）。

```bash
node tools/sync-storyboard-timings.mjs            # 由 bars 反推每帧与每条字幕的时间 → STORYBOARD.md + audio/cue-map.json
node tools/sync-storyboard-timings.mjs --check    # 只报告，不写文件；有 cue 违规 exit 1
node tools/verify-timing.mjs                      # 四项断言（含声学复核）→ audio/timing-verification.json
```

## 1. 硬规则：切点在小节线，重音在拍线

- **每一个镜头切点 = 小节线**：`bar n starts at offset + n × barDuration`。
- **每一个动画重音 = 拍线**：`beat k = offset + k × period`。
- **容差 15 ms**（`vibe.config.json` 的 `timing.toleranceMs`，`verify-timing.mjs` 的 `TOL_MS`）。实测：切点 33/33（最差 −0.5 ms，F5）、字幕 41/41（最差 5.5 ms，F11）、音效 40/40（最差 −1.7 ms）。

**为什么是"小节"而不是"看着舒服的地方"。** 小节线之间的间隔恒定（2.1256 s = 4 拍），观众能听到那个 4 拍循环。切点落在小节线上，被听成"这句话讲完了，音乐走到下一句"；落在 0.3 s 或 1.7 s 这种位置上，和音乐没有任何关系，只能被听成随机。同一帧里的动画重音落在拍线上，于是"画面动一下"和"音乐响一下"是同一件事。成片的 STORYBOARD 头部把这条写成了契约：

> Scene boundaries below are BAR lines only (every cut is a musical downbeat).
> Animation accents are BEAT lines.

**帧内的时间也是同一套。** 每个子合成的本地 0 就是它自己的小节线（packet 里明写 *"The frame's first frame (local 0) is a bar line by construction"*），所以帧内只需要把重音放在本地拍线上。例如 F01 的 packet 直接给出 `local beats: 0, 0.532, 1.063, 1.595, 2.126, 2.657, 3.189, 3.72, 4.251 ...` 和 `bar lines: 0, 2.126, 4.251`——builder 只做减法（`const at = abs => abs - T0`），不做音乐判断。

## 2. 场景长度用小节声明，永远不用秒

先在小节网格上选边界（`node tools/plan-scenes.mjs` 会打印小节网格与候选切点），再写 STORYBOARD。STORYBOARD 里每一帧写的是 `- bars: 12–16`，不是 `duration: 8.5s`。脚本按网格算：

```
barTime(n) = offset + n × barDur
F27  bars: 62–63  →  start = 0.4163 + 62 × 2.1256 = 132.203
                     end   = 0.4163 + 63 × 2.1256 = 134.329
                     dur   = 2.126 s
```

**为什么必须这样。** 秒是"我算出来的一个数"，小节是"音乐里的一个单位"。写小节，改动音乐或改网格只会让时间平移，帧与帧的**相对**关系不会崩；写死秒，则任何一次网格精修都会让整片错位，而且错位量在 33 帧上累积。

**常用长度与实测分布。** 主体的选择是 2 小节（4.251 s，适合一个概念/一次对照）和 4 小节（8.502 s，适合一个完整的论证或一次转场）。成片实际用的（数 `cue-map.json` 的 `startBar`/`endBar`）：

| 长度 | 帧数 | 例 |
|---|---|---|
| 2 小节 = 4.251 s | 24 | F3（bars 6–8），其余大部分推进帧 |
| 4 小节 = 8.502 s | 4 | F4（8–12）、F5（12–16）、F6（16–20）、F22（50–54） |
| 3 小节 = 6.377 s | 3 | F1（0–3）、F2（3–6）、F32（71–74） |
| **1 小节 = 2.126 s** | 1 | **F27（62–63）**，把「也就是大四。」这个年龄揭晓砸下来 |
| 收尾被截断 | 1 | F33（74–75.75）：`end = min(barTime(75.75), 161.017)` → 3.306 s |

两个诚实提醒：

- STORYBOARD 头部的注释只写了 "2-bar (4.25 s) or 4-bar (8.5 s); one 1-bar punch at Frame 27"，实际上还有**三帧是 3 小节**，最后一帧是截断值。声明与实际不一致时，**以 `cue-map.json` 为准**，并回头把注释改成事实。
- 1 小节只能是**一次**的冲击（这里是年龄揭晓）。整片都用 1 小节，节奏就变成平均用力，冲击也就不存在了。

## 3. 永远不要手写字幕时间

STORYBOARD 每帧携带两份**内容**，不带时间：

```markdown
- bars: 12–16
- voiceover: 规则只有一条：一直往前走，不能回头。 ｜ 只能摘一次，摘那支最大的。
```

多条 cue 用全角 `｜` 分隔；`- cues:` 这一行是**派生**的，每次运行都会被整体重写。管线：

```bash
node tools/sync-storyboard-timings.mjs        # 写回 STORYBOARD.md，并生成 audio/cue-map.json
```

这个脚本的写回是**整帧块全量重建**（不是原地替换行），因此可以反复跑：`start` / `end` / `duration` / `cues` 四个 key 每次重算，其余作者写的 key（包括 `bars`）一个都不碰，上一轮 bug 留在正文里的 stale 派生行也会被清掉。幂等是它敢被随便重跑的原因。

成片里一帧的真实形态（F27，作者写的与脚本写的混在同一个 block 里）：

```markdown
## Frame 27 — 也就是大四

- scene: 极短的一格：金框里的 21.7 横向翻转，背面写着"大四"。…… 整格只占一小节。
- shot: 一秒翻牌 · 学年格依次亮起 · 第四格描金
- bars: 62–63                          <- 作者写：这一帧占第 62 到第 63 小节线
- start: 132.203                       <- 派生：= 0.4163 + 62 × 2.1256
- end: 134.329                         <- 派生：= 0.4163 + 63 × 2.1256
- duration: 2.13s                      <- 派生
- transition_in: cut
- voiceover: 也就是大四。                 <- 作者写：一条 cue，没有时间
- display: 「大四」二字 + 学年格 大一/大二/大三/大四
- cues: 132.74–134.15 也就是大四。        <- 派生：吸到拍线、按读载定长度
```

判据：**同一个 block 里出现手写的秒数就是 bug**。`start` / `end` / `duration` / `cues` 只应该由脚本产生；`cues` 里的 `132.74` 是第 249 条拍线（`0.4163 + 249 × 0.5314 = 132.7349`，脚本先 `toFixed(3)` 再 `toFixed(2)`，所以写成 `132.74`），不是谁挑的。

**放置算法（照抄，不要凭直觉改顺序）：**

1. **读载 `load(text)`**：CJK 1.0 / 拉丁字母与数字 0.5 / 空白 0.15 / 其它（标点）0.3。
2. **可用窗口**：`w0 = start + 0.10`（lead）、`w1 = end − 0.18`（tail），`avail = max(0.4, w1 − w0)`。
3. **按读载分配**：第 `n` 条的理想时长 = `avail × load_n / Σload`（非最后一条再减 `MIN_GAP = 0.08`），下限 0.5 s；理想起点 = `w0 + (前面 load 之和 / Σload) × avail`。
4. **PASS 1 — 起点**：先把理想起点吸到拍线上，并且**严格递增**（`k ≤ lastK` 就往后推一拍）；若第一条被推过 `w0` 一个周期以上，回拉到 `w0` 之后的第一条拍线。
5. **PASS 2 — 终点**：最后一条取 `w1`；其余取 `min(s + 理想时长, 下一条的 start − MIN_GAP, w1)`，并且不短于 `s + 0.3`。

**为什么是 PASS 1 → PASS 2，而不是"每条各自算完再吸拍"——这是踩过的坑。** 如果先按比例把每条 `[s, e]` 都算好，再单独把每个 `s` 吸到拍线，后面那条的 `s` 可能落到前一条的 `e` **之前**。这次的后果有两个：**两条字幕在时间上重叠**，以及一条被挤到 **0.88 s** 的 cue——0.88 s < 1.2 s，直接触发读速闸门的 `too short`。所以顺序不可交换：**先把所有起点定下来并保证递增，再用"下一条的起点"去夹住每条的终点。**

（工程记录里没有留下这次 bug 的日志，上述现象来自当时的构建记录，不是从现有 JSON 复算出来的；但脚本的 PASS 1/PASS 2 结构与 `--check` 闸门就是为它加的。）

## 4. 读速闸门：一条 cue 要么看得完，要么改词

`sync-storyboard-timings.mjs` 对每条 cue 算 `cps = load / (e − s)`，两条硬闸门：

- `cps > 6.5` → `too fast`
- `e − s < 1.2 s` → `too short`

任一条命中，`--check` 会列出问题并 `exit 1`。成片实测（41 条 cue，按 `cue-map.json` 复算；`--check` 的输出与之一致，`exit 0`）：

| 指标 | 值 |
|---|---|
| cue 数 | 41（33 帧：8 帧两条、25 帧一条） |
| cps 最小 / 中位 / 最大 | **1.87 / 3.84 / 5.66** |
| 时长范围 | 1.41 – 4.68 s |
| 违规 | **0** |

最快的三条都是短句或高信息密度句：F28「在那之前，别急着摘。」5.66 cps（1.52 s，load 8.6）、F23「但即使算得这么准，你仍有 63% 的概率错过。」5.14 cps（3.54 s，load 18.2）、F21「之后遇到比前面都好的第一支，立刻摘下。」4.97 cps（3.54 s，load 17.6）。

**注意作者口径比闸门更紧：** STORYBOARD 头部写的是「每行 ≤20 字，3–6 字/秒」，而闸门是 6.5。闸门是"绝不能超过"的红线，不是写作目标——贴着 6.5 写出来的字幕读起来是喘的。

**失败时怎么办：改词，或给它更多小节。绝不压缩时间。** 缩短 `e − s` 只会让 cps 更高，那是把问题从闸门推给观众。同理，靠"再塞一条 cue"来填满一帧也会压低每条的时长，先撞 `too short`。

## 5. 大字和字幕分工：不要重复

- **字幕是声音**（本片无旁白，字幕即台词）：完整句子，底部保留带。
- **中央大字是重音**：一个符号、一个数字、一个词，不是句子。
- 判据很简单：**如果某帧的大字和它自己的字幕逐字相同，那一帧的大字没有提供任何信息，删掉它。** STORYBOARD 头部把这条写成一句话：「全片无旁白，字幕即"声音"（每行 ≤20 字，3–6 字/秒），中央大字承担重音。不要在大字里重复字幕原文。」

**成片的真实修法（开场帧）。** packet 里原本给 F01 的 `display:` 是「就是 ta 了？」四个字按拍逐个落下（0.42 / 0.95 / 1.48 / 2.01）——那四个字和字幕里的句子几乎一样。成片把它改成了**一个巨大的「？」**：`compositions/frames/01-question.html` 里 `#f01-q { font-size: 430px; top: 176px }`，内容只有 `<span class="glyph metal bloom-hot">？</span>`，而完整句子「什么时候，才算"就是 ta 了"？」留在 y 872 的字幕带上。效果：画面有一个 430 px 的问号（落在 display 带内：176 + 430 = 606 < 842），声音由字幕说完整句话——两者各干一件事。

**写法上的推论**：display 元素不要放进 `.band-sub`，也不要复用字幕的角色/字号；一帧只有一个 display moment，而它**不是**字幕的放大版。

## 6. 字幕按需，不是每秒都要

cue 的**条数**由你在 STORYBOARD 的 `voiceover:` 里写几段决定（脚本只负责把它们放进窗口）。实测：

- 全片 33 帧、41 条 cue；**160.60 s 里有 24.14 s（15.0%）没有任何字幕**。
- 每帧头部固定留约**一拍**（0.53–0.54 s，因为起点会吸到拍线上）、尾部 0.18 s；帧内没有任何 ≥1.0 s 的空白段——空白是帧级的边距，不是长静默。
- 单条 cue 的帧把后半帧完全交给画面：F27 一条 1.41 s 的「也就是大四。」放进 2.126 s 的帧，剩下 0.72 s 只有画面在动。

所以：**那一个拍的空档就是留给"图形在装配 / 数字在落定"的呼吸**。不要为了填满时间而加第三条 cue，也不要因为"这句只有 5 个字"就顺手并进上一句——条数是叙事节奏的开关。

## 7. 保留带：让"字幕不遮动画"成为结构属性

版面按 canvas 像素分成四条带（`frame.md` 的 `spacing`，`vibe.config.json` 的 `bands`）：

| 带 | y 范围 | 归属 |
|---|---|---|
| chrome | 60 – 120 | mono 角标（帧号、术语、数据出处） |
| display | **140 – 842** | 中央大字、图形、图表、图元 |
| **guard gap** | **842 – 872** | **必须空**（不得有任何内容） |
| subtitle | **872 – 1024** | **只属于字幕轨**，前后加暗角 scrim |

这条规则写在 BUILD-RULES 的硬规则里（每帧的 builder 都要读）：*"Bands are law. Display type, figures and diagrams live in y 140–842. The subtitle band y 872–1024 is reserved and may contain only `.band-sub` subtitle content. y 842–872 must stay empty of content."*

**它为什么是结构属性而不是愿望**：`tools/audit-still.mjs` 对每一张静帧按行分带做像素统计——`BANDS = { chrome:[60,120], display:[140,842], gap:[842,872], subtitle:[872,1024], bottom:[1024,1080] }`，每带算 `bandInk`（亮度 > 60 的像素百分比）和 `bandEdge`（平均水平梯度）。判定：

- `bandInk.gap > 1.0` → 报 `bright content in the gap band y842-872`；
- 字幕带既没 edge 也没 ink → 报 `no detectable subtitle ink in the reserved band`。

**诚实说明（脚本注释的原话）：** gap 带禁止的是**文字和亮图形**，不是所有像素——*"a dim pictorial layer (a wheat silhouette under the subtitle scrim) legitimately crosses it, so the test is on bright ink, not on edge energy."* 这条轨里确实如此：`05-rules.html` 的麦田 baseline 是 1086 / 1150，`10-faster.html` 是 1150 / 1230 / 1330 / 1370，`12-love.html` 是 838 / 838，`06-first-ear.html` 是 840——麦穗的落点由 `baseline − h` 决定，这些**暗**麦穗真的穿过 842–872，甚至穿过整个字幕带（它们在 scrim 之下）。它们不违规，因为规则管的是亮度，不是存在。把这条写清楚，别让下一个 agent 以为"任何像素越界都是 bug"而去砍掉本该有的景。

## 8. 音效落点：role 决定"拍点落在声音的哪个部位"

音效不是"感觉差不多就贴上"。`audio/sfx-map.json` 的设计原则写在它自己的 `note` 里：

```jsonc
{
  "generatedBy": "tools/build-sfx-map.mjs",
  "beat": { "bpm": 112.91, "period": 0.5314, "offset": 0.4163 },
  "note": "all times are film-absolute seconds; roles determine placement physics",
  "count": 43,
  "cues": [ { "mediaStart": 0, "duration": 1.191, "file": "2605-quick-air-woosh.wav",
              "role": "whoosh", "time": 6.1975, "gainDb": -20, "note": "F2 标准线浮现" } ]
}
```

四种 role，各自的"拍点"落在声音的不同部位（`verify-timing.mjs` 用同一个映射算探针）：

| role | 拍点落在 | 例子（成片真实 cue） |
|---|---|---|
| `hit` | `time`（起音） | F22 `563-drum-deep-impact.wav`，`time = 106.696` = 第 200 拍，`gainDb = −10`（全片最响的一条） |
| `whoosh` | `time + duration/2`（中心） | F4 大转场 `1468-cinematic-transition-wind-swoosh.wav`，`time = 16.9515`、`duration = 0.939` → 中心 17.421 = 小节 8 = F4 自己的切点：风正好跨在接缝上，前后两帧各分一半 |
| `riser` | `time + duration`（尾端） | `632-cinematic-drama-riser.wav`，`mediaStart = 28.239`（从 32 s 素材里取尾段）、`duration = 1.9`、`time = 104.796` → 尾端 **106.696 = 第 200 拍 = F22 的揭晓**：上行冲进那一拍，而不是从那一拍开始 |
| `bed` | 不判（无起音） | 3 条长铺底：F4–F8 麦田风声（−30 dB）、F9–F11 低频床（−32 dB）、F22 滴答计数（−30 dB） |

成片 43 条里 31 条 `hit`、8 条 `whoosh`、1 条 `riser`、3 条 `bed`；验收只断言前 40 条，`bed` 被显式排除（`sfx.cues.filter(c => c.role !== 'bed')`）——长铺底没有可以对齐的瞬态。

**为什么值得这么麻烦**：同一个样本，`time` 对齐和 `time + duration` 对齐听感完全不同。riser 只有尾端对齐，观众才觉得"是这一下把画面顶出来的"；whoosh 只有中心对齐，转场才不偏袒任何一侧。把这些写进 `role`，放置就有了可复算的定义，验收也才有得判。

## 9. 验收：断言 + 声学复核

```bash
node tools/verify-timing.mjs     # 有问题 exit 1；明细写 audio/timing-verification.json
```

四项，前三项纯数据（因此"by construction"必然通过——时间就是从同一张网格派生的，它们抓的是**手改**），第四项回到声音：

1. **切点在小节线**：每个 `frame.start` 到最近小节线的 `|err| ≤ 15 ms`。实测 **33/33**，最差 **−0.5 ms**（F5）——因为帧起点由同一个 `barTime(n)` 算出，误差只来自两位小数的舍入。
2. **字幕在拍线**：每条 cue 的 `s` 到最近拍线 ≤15 ms。实测 **41/41**，最差 **5.5 ms**（F11）（PASS 1 只把起点吸到拍线，终点不吸）。
3. **音效在拍线**：按 role 取**探针点**再判——`whoosh` = `time + duration/2`（**中心**落在拍上）、`riser` = `time + duration`（**尾端**落在拍上）、其余 = `time`（**起音**落在拍上）；`bed` 不判（3 条长铺底）。实测非 bed **40/40**，最差 **−1.7 ms**（F1 尘埃落地/问号成形）。这条 role → 探针的映射就是"放置物理"：whoosh 是穿过拍点的一阵风，riser 是冲进拍点的一段上行，hit 是砸在拍点上的一下。
4. **声学复核（渲染成品）**：把渲染出的 `assets/audio/sfx-stem.wav` 解成 48 kHz 单声道，按 `HOP = 128` 算 RMS 包络（**每帧 2.667 ms**，所以所有误差都是 2.7 的倍数）；每条 cue 的模板取它自己样本 `mediaStart` 之后的**前 220 ms**（一定含起音），在期望位置 **±80 ms** 内做归一化互相关，取最大相关的 lag 当实测位置。

第四项的三个设计决定，都要照抄：

- **用 cue 自己的包络做模板，而不是朴素 onset 检测。** 音效会互相叠（whoosh 落在 impact 尾巴上），重叠时没有干净的上升沿。
- **搜索窗只有 ±80 ms。** 放宽会让"同一条样本做的邻居 cue"（F5 的三下 tick、F16 的 impact + ping、F27 的 bass + ping）抢走相关峰，报出假误差。放置本身是精确到毫秒的 `adelay`，唯一预期的偏移是限幅器 lookahead。
- **判定分三层。** `correlation > 0.35` 且不与另一条 cue 冲突 → 计为"独立验证"；若另一条 cue 的探针在 **350 ms** 内 → 标 **ambiguous**（两条模板重叠，边界大小的误差是歧义，不是错位）；容差按音形给：**hit 25 ms、whoosh/riser 80 ms**（宽带平滑包络的相关峰本来就会游走几十毫秒）。

成片实测（`audio/timing-verification.json`）：检查 40 条，**独立验证 31 条、ambiguous 9 条、weak correlation 0 条**；误差**中位 2.7 ms**、平均 5.9 ms、最大 |err| 58.7 ms（F13 硬切森林的 whoosh，`r = 0.909`，仍在它 80 ms 的容差内）；`problems` 为空 → exit 0。worst 表里那些整齐的 10.7 ms 是 **128/48000 = 2.667 ms** 量化格上的限幅器 lookahead，不是音乐漂移。（README 的早期文字写的是"12 条 ambiguous / 28 条独立验证"，与当前 JSON 的 9 / 31 不一致；**以 JSON 为准**，并把 ambiguous 的条数原样写进交付说明。）

**已知 wart（复用前先修）：** `verify-timing.mjs` 在 `weakCorrelation > 0` 时会打印 `acoustic.notDetectedNotes`，而 JSON 里只有 `weakNotes`，这个字段不存在——一旦出现弱相关，脚本会抛 `TypeError` 且**写不出** `timing-verification.json`。把它改成 `weakNotes` 再跑。

**交付口径：** 把第 1–4 项的四行输出抄进 README/交付说明（本片：切点 33/33 最差 0.5 ms、字幕 41/41 最差 5.5 ms、音效 40/40 最差 1.7 ms、声学中位 2.7 ms）。"卡点做到了"必须是一句**被断言过的**话，而不是一句声称。
