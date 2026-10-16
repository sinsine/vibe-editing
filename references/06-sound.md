# 06 · 声音：来源、处理、卡点、混音、声学复核

BGM 已经定好，你要补出**音效层**，并且能**证明**它卡在拍上——不是"加几个音效"，
而是一条可复现的流水线，每一步都留下可查的证据文件。

```bash
node tools/fetch-sfx.mjs catalogue             # 曲库 → audio/sfx-catalog.json
node tools/fetch-sfx.mjs download <id...>      # 选中的 → assets/sfx/ + audio/sfx-licenses.json
node tools/prep-sfx.mjs                        # 处理 → assets/sfx/prepped/ + audio/sfx-measured.json
node tools/build-sfx-map.mjs                   # 按拍网格设计 → audio/sfx-map.json + audio/sfx-beat-alignment.json
node tools/mix-soundtrack.mjs                  # 一次混成母带 → assets/audio/mix.wav + audio/mix-report.json
node tools/verify-timing.mjs                   # 数据 + 声学复核 → audio/timing-verification.json
```

## 1. 来源优先，而且要诚实

**真实来源：`mixkit.co`。** 分类页 `https://mixkit.co/free-sound-effects/<category>/`，
素材直链是猜不出也搜不到的固定形状：

| 要什么 | 从哪里拿 |
|---|---|
| 音频 | `https://assets.mixkit.co/active_storage/sfx/<id>/<id>-preview.mp3` |
| 波形 | `https://assets.mixkit.co/active_storage/sfx/<id>/<id>-waveform.json` |
| 标题 | `class="item-grid-card__title"` |
| 时长 | `data-test-id="duration"` |
| 落地页 | `https://mixkit.co/free-sound-effects/download/<id>/` |

**解析要按条目容器切，不要整页正则。** 先 `html.split('class="item-grid__item"').slice(1)`，
再在每个片段里找 id / 标题 / 时长——否则标题和时长会挂到相邻的另一个声音上。爬取带正常 UA，
**单个分类失败不许中断全局**：30 个分类挂几个就挂几个，`catalogue` 继续跑，最后落
`audio/sfx-catalog.json`（键 `source` / `license` / `licenseUrl` / `fetchedNote` / `count` / `items[]`）。

### 许可：这是最容易撒谎的地方

Mixkit Free License = **可商用、无需署名**，但它**不是 CC0**。所以：

- **永远不要把没确认过的文件标成 CC0。** 不是 CC0 就不许写 CC0。
- 逐个文件建账本 `audio/sfx-licenses.json`：`source` / `license` / `licenseUrl` / `files[]`，
  每条 `{id, file, title, bytes, source, page, license, licenseUrl}`——本片 19 个文件 19 条记录。
- 交付文档照抄这句：`Mixkit Free License — free for commercial use, no attribution required`
  ＋ `https://mixkit.co/license/#sfxFree`。

**不要假设某一个曲库。** 本机环境 Openverse 不可达，freesound 的 API 需要 token（没有）。
写进 skill 的必须是**发现方法 + 记录方法**，而不是"去某站某分类点下载"——
换一台机器、换一个网络，能用的库就变了，账本格式不能变。

## 2. 每个文件用同一条链处理

渲染器的混音器只吃 **48 kHz 立体声 PCM WAV**，所以 `prep-sfx.mjs` 对**所有**文件跑同一串 filter：

```
# 两端裁静音：裁头(5ms/-50dB/peak) → 反转 → 再裁头(10ms) → 反转回来
silenceremove=start_periods=1:start_duration=0.005:start_threshold=-50dB:detection=peak,areverse,
silenceremove=start_periods=1:start_duration=0.01:start_threshold=-50dB:detection=peak,areverse,
afade=t=in:st=0:d=0.008,aformat=sample_fmts=fltp:channel_layouts=stereo:sample_rates=48000,
dynaudnorm=f=200:g=5:p=0.9:m=10,alimiter=limit=0.85
```

四个决定：

- **两端裁静音，用 `areverse` 技巧。** `silenceremove` 只裁头部；"裁头 → 反转 → 再裁头 → 再反转"就等于把尾部也裁了。前 5 ms、后 10 ms，都是 −50 dB / `detection=peak`。
- **边缘 8 ms 淡入，为了不"咔"。** 这串里**只有 `afade=t=in`**：尾部没有淡出，靠 −50 dB 裁切收干净；哪个文件尾噪大，自己补 `afade=t=out:st=<dur-0.008>:d=0.008`。
- **`dynaudnorm` 先把小音效抬到能用**（`f=200:g=5:p=0.9:m=10`），**`alimiter` 再限峰**（`limit=0.85`）。
- 输出 `-c:a pcm_s16le`，48 kHz 立体声。

### 处理完必须量，量出来的东西决定怎么放

`audio/sfx-measured.json` 的 `files[]` 每条给 `duration / peakDb / rmsDb / centroidHz / attackSec`。

| 指标 | 本片真实范围 | 例子 |
|---|---|---|
| `duration` | 0.105 s … 52.753 s | 最短 `2544-metal-button-radio-ping.wav`；最长 `1177-deep-cinematic-wind-hum.wav` |
| `attackSec` | 0 … 0.235 s | `2943-tree-branch-brake` / `2544-…-ping` / `2299-short-bass-hit` = 0；`1237-wind-in-the-forest` = 0.235 |

**用 `attackSec` 放瞬态**：起音 0.235 s 的东西**不是** hit，拿它当落字音会永远慢半拍。
`centroidHz` 本意是分开 whoosh（宽）/ tick（高）/ impact（低），但它在本片是 null——见下面这个坑。

### 坑：量了半天全是 null

`audio/sfx-measured.json` 里 `peakDb`、`rmsDb`、`centroidHz` **全是 `null`**，只有 `duration` 和 `attackSec` 有值。原因和 `volumedetect` 那节（第 7 节）同一个：**`astats` 把结果打在 stderr，而 `execFileSync` 默认只回 stdout**——三个字段静默变 null，脚本照样"成功"退出。

真实电平后来落在 `audio/sfx-loudness.json`（`file` / `meanDb` / `maxDb` / `kb`）：

| 文件 | `meanDb` | `maxDb` | 含义 |
|---|---|---|---|
| `2544-metal-button-radio-ping.wav` | −31.3 | −12.1 | 全库最轻，放下去基本听不见，要抬 |
| `1177-deep-cinematic-wind-hum.wav` | −10.6 | 0 | 最满，当 bed 必须先压 |
| `1053-ticking-counter.wav` | −30.8 | 0 | 峰值贴顶的 bed，混音时会顶 limiter |

**规则：任何"测量"脚本，先确认它读的是 stderr 还是 stdout。**

## 3. 按网格设计 cue，用物理而不是感觉

cue 不许写"手打的秒数"，必须声明在拍/小节网格上。网格来自 `audio/timing-map.json`：本片
`beat = { bpm: 112.91, period: 0.5314, offset: 0.4163 }`，`bar = 4 拍 = 2.1256 s`，片长 `161.017 s`；`beat(k) = offset + k * period`。

角色决定落点，各有各的物理：

| 角色 | 落点规则 | 为什么 | 本片实例 |
|---|---|---|---|
| `whoosh` | **切点居中**：`time = cut − len/2` | 空气是在画面切换那一刻扫过去的 | F4：`17.421 − 0.939/2 = 16.9515` |
| `riser` | **结束落在揭晓拍**，用 `mediaStart` 从长文件尾部取 | 上行音必须"到"，不能"过" | F22：30.139 s 文件取 `mediaStart 28.239`、`duration 1.9`，终点 `106.696` |
| `impact` / `tick` / `ping` | **起音落在拍上**：`time = beat(k)` | 瞬态就是重音本身 | F12「这就是爱情」`impact` @ `bar(31)` |
| `bed` | 长低电平层，可截断 | 铺气氛，不参与卡点 | F4–F8 风声 25.306 s 全长；F9–F11 低频 52.753 s 文件截到 12.753 s |

### 本片的真实清单（43 条）

| 角色 | 条数 | 增益范围 | 备注 |
|---|---|---|---|
| `whoosh` | 8 | −13 … −20 dB | 三个大转场 F4/F15/F24 = −13 / −14 / −15 dB；硬切森林 F13 = −15 dB |
| `riser` | 1 | −13 dB | 只有一条，用在 36.8% 揭晓前 |
| `hit` | 31 | −10 … −22 dB | 最响是 F22 揭晓（−10 dB），最轻是 F1 尘埃落地（−22 dB） |
| `bed` | 3 | −30 … −32 dB | 风声 / 低频 / 蒙特卡洛计数 |
| **合计** | **43** | **−32 … −10 dB** | |

每条 cue 写成 `{ mediaStart, duration, file, role, time, gainDb, note }`，`build-sfx-map.mjs`
写文件前自己过三道闸：请求长度不超过文件在 `mediaStart` 之后的剩余、`time` 不为负、
`time + duration` 不越过片尾。

### 数据层卡点自检

同一脚本顺手算每条 cue 离最近拍线多远，**whoosh 量中点、riser 量终点、hit 量起点**——探针用错会把正确的 cue 判成错的。结果落 `audio/sfx-beat-alignment.json`（`within15ms` / `total` / `entries[].errMs`）：
本片 **40/40 在 15 ms 内，最差 −1.7 ms**（F1 尘埃落地；3 条 bed 不参与卡点，所以是 40 不是 43）。

## 4. 要避开的那个 bug（以及它的成因）

**第一次把 F5 三条规则的落字 tick 放在"每 8 拍一个"的等差步进上。**
8 拍 = 8 × 0.5314 = 4.2512 s，而 F5 全长 8.502 s（`start 25.923` → `end 34.425`）。
于是第三个 tick 落在 `34.426`——**比自己所在这一帧的结尾还晚 0.9 ms**，音效越过了它自己的画面。
这是"猜节奏型"的必然结局：模板和镜头不是同一个东西。

正确做法：**从这一帧自己的拍号推。**

```js
const fr = frame(5);
const b0 = Math.round((fr.start - offset) / period);      // = 48（0 起算）
for (const k of [b0, b0 + 4, b0 + 7]) hit('1061-clock-ticker-single.wav', beat(k), -19, ...);
// → 25.9235 / 28.0491 / 29.6433，即全片第 49 / 53 / 56 拍；帧内局部 0 / 2.126 / 3.720 s
```

第三条 tick 与同帧的 `impactSoft` 小节重音同刻（`29.6433`），一个"落字"、一个"落定"，收得住。

**有 builder 之后更直接：读它自己的重音表 `.hyperframes/accents/FNN.json`。**
结构是 `{ frame, compositionId, durationS, accents[] }`，每条 `{ localS, on: "bar"|"beat", what }`
（例：F12 的 `localS 2.126, on "bar"` 就是「爱情」落字）。有这张表就不该再去反推网格。
本仓库的 accents **从 F12 才开始有**，F1–F11 没有——所以 F5 只能从网格推，但这不是偷懒的借口。

> 规则：**永远不要用猜出来的节奏型放 cue。** 每条 cue 的时间都要能追到帧自己的 bar/beat 坐标，
> 或者 `accents/FNN.json` 里的 `localS`。
> 附带一条：`build-sfx-map.mjs` 那行注释自称局部偏移是 `0 / 2.656 / 4.250`，代码实际算出来是
> `0 / 2.126 / 3.720`。**注释不是证据，跑一遍打印出来才是。**

## 5. 一次混成一条母带

为什么不把音效挂在合成的时间轴上，而是预先混一个文件：

1. **BGM 已经是热母带：−10.3 LUFS integrated、LRA 3.0。** 它需要真实的增益结构，而不是各放各的。
2. **全片需要同一个 limiter。** 分段限幅 = 分段音色，卡点那一下会露。
3. **预混之后才能测。** 成品 `mix.wav` 可以被时长、LUFS、真峰值、瞬态位置逐项检查。

### 图（`mix-soundtrack.mjs`）

```
[0:a]aformat=sample_fmts=fltp:channel_layouts=stereo:sample_rates=48000,volume=-4dB[bed]
# 每条 cue：atrim → asetpts → volume → adelay
[i:a]aformat=sample_fmts=fltp:channel_layouts=stereo:sample_rates=48000,atrim=start=<mediaStart>:duration=<dur>,asetpts=N/SR/TB,volume=<gainDb 或 gainDb+3.5>dB,adelay=<ms>|<ms>[s<i>]
[s0][s1]…[sN]amix=inputs=N:normalize=0:dropout_transition=0[sfx]
[bed][sfx]amix=inputs=2:normalize=0:dropout_transition=0[mixed]
[mixed]highpass=f=28,equalizer=f=190:width_type=q:w=1:g=-1.2,alimiter=limit=0.82:attack=1:release=30:level=disabled,aresample=48000,atrim=0:161.017[out]
```

三个细节别省：`asetpts=N/SR/TB`（`atrim` 后必须重打时间戳）、`normalize=0`（`amix` 默认按输入数把每条都除下去，卡点会全被压平）、`adelay=<ms>|<ms>`（两个声道都要，只给一个等于右声道不响）。

**增益结构**：`BGM_DB = -4`（床压到 −4 dB），`SFX_TRIM = 3.5`（所有**非 bed** cue 统一抬 3.5 dB）。
所以 `gainDb = -32` 的 bed 就是 −32 dB，而 `gainDb = -10` 的揭晓重音实际是 −6.5 dB。

### 母带链（真实字符串）

```
highpass=f=28,equalizer=f=190:width_type=q:w=1:g=-1.2,alimiter=limit=0.82:attack=1:release=30:level=disabled,aresample=48000
```

两个修正，都是踩出来的：

- **去掉了 compressor。** 对已经重度限幅的母带再压只会**抽气**（pumping）：动态一点没多，卡点的冲击反而被压回去。链上留下的是高通（清 28 Hz 以下）+ 190 Hz 一个 −1.2 dB 窄衰减（给低频让位）+ 一个安全 limiter。
- **`alimiter` 不能吃默认值。** 默认 5 ms attack 加自动电平，会让一个瞬态**摸到 0 dBFS**；
  改成 `limit=0.82:attack=1:release=30:level=disabled` 之后天花板才是真的。
成片实测：**真峰值 −1.4 dBTP、采样峰值 −1.7 dBFS**（`ebur128=peak=true` 与 `volumedetect`）。
注意 0.82 线性不等于 −1.72 dBTP——那是采样峰值；真峰值要考虑采样间过冲，实测比它高 0.3 dB。

### 交付数字

| 量 | 值 | 出处 |
|---|---|---|
| mix 时长 | 161.000 s（片长 161.017 s，差 17 ms） | `audio/mix-report.json` |
| mix integrated | **−14.8 LUFS**，LRA 3.0，mean −14.3 dB，max −1.7 dB | `audio/mix-report.json` |
| SFX stem | −27.1 LUFS，LRA 22.2，mean −35 dB，max −6.5 dB | `audio/mix-report.json` |
| 成片 MP4（AAC） | **−14.9 LUFS / 峰值 −1.7 dBFS** | 交付行 `videos/<片名>/README.md` |

**目标是 −14 LUFS ±1**（网络视频通行区）。`mix-soundtrack.mjs` 的硬闸门：时长与
`timing-map.duration` 差不超过 0.35 s、真峰值不高于 −0.8 dBFS、integrated 落在 −18…−11。

## 6. 声学复核，以及你复核不了的部分

数据层只能证明"我打算放在拍上"，证明不了"混出来真的在那儿"。所以要**解码成品**再量一次。

做法（`verify-timing.mjs` 第 4 段）：

1. 把 `assets/audio/sfx-stem.wav`（只有音效、没有 BGM 的那一版）解成 48 kHz 单声道 s16le raw，并以 `HOP = 128` 采样（= 2.667 ms）算 RMS 能量包络。
2. 每条 cue 取**它自己**在 `mediaStart` 之后**前 220 ms** 的包络当模板（起音一定在这段里）。
3. 在 **±80 ms** 内做归一化互相关找最佳 lag；`correlation > 0.35` 才算定位成功。
4. 分角色容差：**hit 25 ms，whoosh / riser 80 ms**。

两个设计理由，都不是随便定的：

- **搜索窗只给 ±80 ms。** `adelay` 是毫秒级精确的，唯一预期偏移是几毫秒 limiter 前视；窗开大了，
  cue 会锁到旁边那条音效上——尤其是用**同一个采样**做的邻居（F5 三条 tick、F16 的 impact + ping、
  F27 的 bass + ping），于是报一个假错误而不是验证。
- **whoosh 容差放到 80 ms。** 它的包络又宽又平，相关峰本来就漂几十毫秒，声音其实没动。

### 真实结果

| 项 | 值 |
|---|---|
| 检查的 cue | 40（3 条 bed 不参与） |
| 独立定位成功 | 28 |
| **`ambiguous`（与另一条 cue 相距 <350 ms）** | **12** |
| 弱相关（`r ≤ 0.35`） | 0 |
| 误差中位数 | **2.7 ms**（mean 5.9 ms，max \|err\| 58.7 ms——一条 whoosh，在其容差内） |

**那 9 条为什么是 `ambiguous` 而不是"通过"：** 两条 cue 相距不到 350 ms 时两个模板互相重叠，
包络互相关**在原理上**无法把它们各自独立定位。此时报 0 ms 或报 300 ms 都不代表它错了，
只代表**这一次测量没有分辨力**。所以它单独归类：既不算通过，也不算失败。

> **复核不许声明超过它量到的东西。** `ambiguous ≠ passed`。交付文档要分开写
> "独立验证 31 条（中位 2.7 ms）"和"9 条因相邻而无法独立定位"，不能合并成一句"全部通过"。
> （早期一次运行按"起点"比较 whoosh，得到 12/28；改成按中点比较后是 9/31，以后者为准。）
> 再诚实一点：同一脚本换一轮放置就会换一批 ambiguous——本仓库留档的
> `audio/timing-verification.json` 是**另一轮**（9 ambiguous / 31 verified / 同样中位 2.7 ms）。
> 引用数字时写清是哪一轮的产物，别把两次运行混成一句。

## 7. 实操闸门

| 闸门 | 怎么做 | 踩过的坑 |
|---|---|---|
| 响度/峰值测量 | `ebur128` + `volumedetect`，匹配 `I:` / `LRA:` / `mean_volume` / `max_volume` / `Peak:` | **它们输出在 stderr。** 只收 stdout 的捕获会静默返回一堆 null——这个 bug 真的发生过（见第 2 节）。用 `spawnSync`，把 stdout 与 stderr 拼起来再正则 |
| 真峰值闸门 | `if (truePeakDb !== null && truePeakDb > -0.8) fail` | **`null` 会静默跳过闸门。** `audio/mix-report.json` 里 `truePeakDb` 就是 `null`（`Peak:` 没匹配上），而 `maxDb` 有值 −1.7。报告里出现 null 字段 = 那道闸门没生效：要么换字段，要么让 null 直接 fail |
| 时长 | mix 时长与 `timing-map.duration` 对齐（本片 161.000 vs 161.017） | 混音**比片子短就是一段静音尾巴**，不是黑场——肉眼看不出来，观众听得出来；差几秒就是事故 |
| `<audio>` 挂载 | 必须有 `id`，并给 `data-start` / `data-duration` / `data-track-index` | **没有 `id`，混音器会静默丢弃这条音轨。** 本片：`<audio id="soundtrack" src="assets/audio/mix.wav" data-start="0" data-duration="161.017" data-track-index="90">` |
| 缺文件 | 混音前要求 `assets/sfx/prepped/` 里每条 cue 的文件都在 | 现在只是 `! missing X, cue skipped` 然后继续——混出来少音效、不报错。改成 fail |
| 交付前 | `prep-sfx.mjs && build-sfx-map.mjs && mix-soundtrack.mjs && verify-timing.mjs`，四个 `exit code` 全 0 | 这几个脚本的 `problems` 都会 `process.exitCode = 1`；退出码被忽略就等于没有闸门 |

**一句话：** 来源写清楚（许可不许美化）、处理链固定、落点由画面而不是模板决定、整片一个 limiter、
混完必须从**成品音频**里再量一遍——量不到的要写成"量不到"，不能写成"通过"。
