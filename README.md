# microbit-pitch-detector (MakeCode, micro:bit V2)

用 micro:bit V2 内置麦克风采样声音，做**频谱分析（Goertzel 实现，等价于 FFT 的单频点扫描）**，在 LED 点阵上显示当前音调的**简谱度数**：

```
1=do  2=re  3=mi  4=fa  5=sol  6=la  7=si
```

对着麦克风哼 "do re mi"，屏幕依次显示 `1 2 3`。安静时熄屏。

## 结构

| 文件 | 说明 |
|---|---|
| `main.ts` | 主程序：Goertzel 频谱扫描、主频检测、简谱映射、LED 显示（**所有可调参数都在这**） |
| `micfft.cpp` | C++ 采集层：CODAL 音频管线拿原始 PCM（官方 TS API 不暴露波形，只能用 C++） |
| `shims.d.ts` | C++ 层的 TS 声明（`micfft.getSamples/sampleRate/setSensitivity`） |
| `pxt.json` | MakeCode 包描述 |

## 原理

- **采集**（C++）：`mic ADC → StreamNormalizer → StreamSplitter → SplitterChannel → DataSink`，以 11kHz 采 1024 点（约 93ms，频率分辨率 ~10.7Hz），转成 int16 缓冲交给 TS。
- **频谱**（TS）：对 65~1000Hz 做 Goertzel 扫描（8Hz 粗扫 + ±8Hz 逐 Hz 细扫），功率最大的频点即主频。
- **音调**：主频 → MIDI 音符号 → 半音序号 → C 大调白键映射为简谱 1~7（黑键向左吸附）。
- **防跳**：连续 2 帧相同才切换显示；`input.soundLevel() < 60` 视为静音熄屏。

## 使用（需 micro:bit V2，V1 没有麦克风）

1. **推到 GitHub**：本目录包含 C++，MakeCode 网页编辑器不能在线创建 C++ 扩展，需要整个目录 push 到 GitHub 仓库。
2. **导入**：打开 https://makecode.microbit.org → **导入** → **导入 URL** → 填仓库地址。
   - 若按项目导入报 C++ 编译错误，则改用扩展方式：登录 GitHub 后 **扩展（Extensions）** → 导入该仓库 → 新建项目添加该扩展后下载。
3. **下载 .hex** 拖入 micro:bit（MAKECODE 盘）。
4. 哼唱/演奏 C 大调音阶，屏幕显示对应数字。

## 调参（main.ts 顶部）

| 参数 | 默认 | 说明 |
|---|---|---|
| `LEVEL_GATE` | 60 | 静音门限，环境吵调大、声音轻调小 |
| `SENSITIVITY` | 1.0 | 麦克风增益，声音小调大（2.0+） |
| `MIN_HZ / MAX_HZ` | 65 / 1000 | 扫描范围，只需人声可收窄到 80~500 |
| `SHOW_HZ_DEBUG` | false | 串口输出主频（调试用） |

## 已知限制

- 仅 micro:bit **V2**（V1 无麦克风，会 `target_panic` 不支持）。
- C++ 采集层无法在网页模拟器中运行（模拟器不支持 `micfft`，会黑屏/无反应），**必须烧到 V2 真机测试**。
- 人声音准不稳时数字可能跳动；若想要更稳可把防跳帧数从 2 调大（`candCount >= 2`）。
