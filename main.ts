/**
 * micro:bit V2 音调检测器
 * 麦克风采样 (C++ 层) -> Goertzel 频谱扫描 (等价于 FFT 的单点实现)
 * -> 主频 -> 简谱度数 (1=do ... 7=si) -> LED 点阵显示
 *
 * 仅支持 micro:bit V2 (带内置麦克风)。原始 PCM 由 micfft.cpp 采集。
 */

// ===== 可调参数 =====
const SHOW_HZ_DEBUG = false  // true: 串口输出检测到的主频, 便于调试
const MIN_HZ = 65            // 扫描下限 (C2)
const MAX_HZ = 1000          // 扫描上限
const SENSITIVITY = 1.0      // 麦克风灵敏度: 声音小调大 (如 2.0)

// ===== 静音门限: 共 10 档, 按 A 减小 / 按 B 增大 (默认第 4 档) =====
const GATE_LEVELS = [20, 30, 40, 55, 70, 90, 110, 135, 160, 190]
let gateLevel = 3            // 当前档位索引 0..9 (soundLevel 门限 = GATE_LEVELS[档位])
let gateDisplayTicks = 0     // >0 时临时显示当前档位数字

const FS = micfft.sampleRate()  // 11000

// 半音 0..11 (C, C#, D, D#, E, F, F#, G, G#, A, A#, B) -> 简谱度数 1..7
// 黑键吸附到左侧白键 (C#->1, D#->2, F#->4, G#->5, A#->6)
const PC_TO_DEGREE = [1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6, 7]

// MakeCode 的 TS 子集没有 Math.log2, 用 Math.log 换底缓存
const LOG2 = Math.log(2)

/**
 * Goertzel 算法: 计算 buf 在 freq 处的频谱功率
 * 等价于 DFT/FFT 的单频点输出, 扫多个频点即得到频谱
 */
function goertzelPower(buf: Buffer, freq: number): number {
    const coeff = 2 * Math.cos((2 * Math.PI * freq) / FS)
    let s1 = 0
    let s2 = 0
    for (let i = 0; i < buf.length / 2; i++) {
        const s0 = buf.getNumber(NumberFormat.Int16LE, i * 2) + coeff * s1 - s2
        s2 = s1
        s1 = s0
    }
    return s1 * s1 + s2 * s2 - coeff * s1 * s2
}

/**
 * 主频检测: 8Hz 步进粗扫, 再 ±8Hz 逐 Hz 细扫
 */
function detectFrequency(buf: Buffer): number {
    let bestF = 0
    let bestP = 0
    for (let f = MIN_HZ; f <= MAX_HZ; f += 8) {
        const p = goertzelPower(buf, f)
        if (p > bestP) {
            bestP = p
            bestF = f
        }
    }
    if (bestF == 0)
        return 0
    for (let f = bestF - 8; f <= bestF + 8; f++) {
        if (f < MIN_HZ)
            continue
        const p = goertzelPower(buf, f)
        if (p > bestP) {
            bestP = p
            bestF = f
        }
    }
    return bestF
}

/**
 * 频率 -> 简谱度数 1..7 (以 C 大调白键为基准, 黑键向左吸附)
 */
function freqToDegree(hz: number): number {
    const midi = 69 + 12 * Math.log(hz / 440) / LOG2   // MIDI 音符号: A4(440Hz)=69
    const pc = ((Math.round(midi) % 12) + 12) % 12
    return PC_TO_DEGREE[pc]
}

let stableDeg = 0   // 当前显示的度数
let candDeg = 0     // 候选度数
let candCount = 0   // 候选连续帧数 (防闪跳: 连续 2 帧相同才切换)

// 按 A 减小门限 / 按 B 增大门限, 共 10 档 (对应 soundLevel 20~190)
function bumpGate(delta: number) {
    gateLevel = Math.min(GATE_LEVELS.length - 1, Math.max(0, gateLevel + delta))
    candDeg = 0
    candCount = 0
    gateDisplayTicks = 6   // 显示约 6 帧当前档位
}
input.onButtonPressed(Button.A, function () { bumpGate(-1) })
input.onButtonPressed(Button.B, function () { bumpGate(1) })

basic.forever(function () {
    // 门限档位临时显示窗口
    if (gateDisplayTicks > 0) {
        gateDisplayTicks--
        basic.showNumber(gateLevel + 1, 60)
        pause(120)
        return
    }

    // 静音判断: soundLevel 低于当前档位门限则熄屏, 避免噪声乱跳
    if (input.soundLevel() < GATE_LEVELS[gateLevel]) {
        stableDeg = 0
        candDeg = 0
        candCount = 0
        basic.clearScreen()
        pause(50)
        return
    }

    const buf = micfft.getSamples()
    const hz = detectFrequency(buf)
    if (SHOW_HZ_DEBUG)
        serial.writeValue('hz', hz)

    if (hz <= 0) {
        basic.clearScreen()
        return
    }

    const deg = freqToDegree(hz)
    if (deg == candDeg) {
        candCount++
    } else {
        candDeg = deg
        candCount = 1
    }
    if (candCount >= 2 && deg != stableDeg) {
        stableDeg = deg
        // 显示度数数字: 1=do 2=re 3=mi 4=fa 5=sol 6=la 7=si
        basic.showString(String.fromCharCode(48 + stableDeg), 20)
    }
})

// 初始化: 提示语 + 打开麦克风
micfft.setSensitivity(SENSITIVITY)
basic.showLeds(`
    . . . . .
    . # # # .
    . # . # .
    . # # # .
    . . . . .
    `)
