// Auto-generated-style shims for the C++ capture layer (see micfft.cpp)
declare namespace micfft {

    /**
     * 采集一帧麦克风原始 PCM
     * @return int16-LE 采样缓冲 (8bit 归一化采样已转为 16bit 居中)
     */
    //% shim=micfft::getSamples
    //% parts="microphone"
    function getSamples(): Buffer;

    /**
     * 采集采样率 (Hz)
     */
    //% shim=micfft::sampleRate
    function sampleRate(): int32;

    /**
     * 设置麦克风灵敏度 (1.0 = 默认, 0.1 = 低, >1 = 更高)
     */
    //% shim=micfft::setSensitivity
    //% parts="microphone"
    function setSensitivity(gain: number): void;
}
