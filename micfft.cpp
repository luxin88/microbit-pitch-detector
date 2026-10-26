/**
 * 麦克风原始 PCM 采集 (micro:bit V2 / CODAL)
 *
 * 音频管线 (参考 pxt-microbit libs/audio-recording 的用法):
 *   mic ADC -> micFilter -> StreamNormalizer -> StreamSplitter(8bit 归一化)
 *     -> SplitterChannel -> MicFFTSink (本扩展的 DataSink, 收集采样)
 *
 * 官方 TS API (input.soundLevel 等) 不暴露原始波形, 所以这里用 C++ 拿 PCM,
 * 频谱分析 (Goertzel/FFT) 在 TS 层 main.ts 完成。
 */
#include "pxt.h"
#include "MicroBit.h"

#if MICROBIT_CODAL
#include "DataStream.h"
#include "StreamSplitter.h"
using namespace codal;
#endif

#define MICFFT_SAMPLES        1024   // 一帧采样数: 1024 @ 11kHz = 93ms, 频率分辨率 ~10.7Hz
#define MICFFT_SAMPLE_RATE    11000  // 与 audio-recording 默认一致
#define MICFFT_TIMEOUT_MS     400    // 等待采满一帧的超时

#if MICROBIT_CODAL

namespace codal {
    class MicFFTSink : public DataSink {
      public:
        DataSource &upstream;
        uint8_t samples[MICFFT_SAMPLES];
        volatile int count;
        volatile bool want;

        MicFFTSink(DataSource &src) : upstream(src) {
            count = 0;
            want = false;
        }

        // 与 LevelDetector 相同的消费模式: 上游有数据时回调, 在这里 pull 一帧
        virtual int pullRequest() override {
            if (!want)
                return DEVICE_BUSY;  // 不需要数据时让上游直接丢帧
            ManagedBuffer b = upstream.pull();
            if (!b.length())
                return DEVICE_BUSY;
            uint8_t *p = (uint8_t *)&b[0];
            int n = b.length();
            for (int i = 0; i < n && count < MICFFT_SAMPLES; i++)
                samples[count++] = p[i];
            if (count >= MICFFT_SAMPLES)
                want = false;
            return DEVICE_OK;
        }
    };
}

static SplitterChannel *chan = NULL;
static MicFFTSink *sink = NULL;

static void ensureSetup() {
    if (sink != NULL)
        return;
    MicroBitAudio::requestActivation();
    uBit.audio.activateMic();
    uBit.audio.mic->setSampleRate(MICFFT_SAMPLE_RATE);
    chan = uBit.audio.splitter->createChannel();
    sink = new MicFFTSink(*chan);
    chan->connect(*sink);
    chan->dataWanted(DATASTREAM_WANTED);
}
#endif

namespace micfft {

    /**
     * 采集一帧麦克风原始 PCM (阻塞 ~93ms)
     * @return int16-LE 采样缓冲
     */
    //%
    Buffer getSamples() {
    #if MICROBIT_CODAL
        ensureSetup();
        sink->count = 0;
        sink->want = true;
        int waited = 0;
        while (sink->count < MICFFT_SAMPLES && waited < MICFFT_TIMEOUT_MS) {
            fiber_sleep(1);
            waited++;
        }
        Buffer out = mkBuffer(NULL, MICFFT_SAMPLES * 2);
        int16_t *dst = (int16_t *)out->data;
        int fmt = chan->getFormat();
        for (int i = 0; i < sink->count; i++) {
            // 8bit 归一化采样统一转为居中的 int16
            int v = (fmt == DATASTREAM_FORMAT_8BIT_UNSIGNED)
                        ? (int)sink->samples[i] - 128
                        : (int)(int8_t)sink->samples[i];
            dst[i] = (int16_t)(v * 128);
        }
        return out;
    #else
        target_panic(PANIC_VARIANT_NOT_SUPPORTED);
        return mkBuffer(NULL, 0);
    #endif
    }

    /**
     * 当前采样率 (Hz)
     */
    //%
    int32_t sampleRate() {
        return MICFFT_SAMPLE_RATE;
    }

    /**
     * 设置麦克风灵敏度
     * @param gain 灵敏度 (1.0 = 默认)
     */
    //%
    void setSensitivity(float gain) {
    #if MICROBIT_CODAL
        ensureSetup();
        uBit.audio.processor->setGain(gain);
    #endif
    }
}
