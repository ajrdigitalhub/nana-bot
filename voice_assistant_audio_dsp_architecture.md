# Technical Architecture Specification: Voice Assistant & Real-Time Audio DSP Integration

**Target Hardware**: ESP32-C3 Firmware System & Mochi Avatar Web Interface  
**Author**: Antigravity AI Engineering Team  
**Date**: August 2026  
**Document Status**: Approved Engineering Reference  

---

## 1. Executive Summary

This specification details the technical feasibility, hardware schematics, cloud AI pipeline, real-time Digital Signal Processing (DSP) equalizer, spectrum analyzer, and avatar sync engine for adding **Amazon Alexa-style Voice Assistant** and **Real-Time Sound-Reactive Equalizer** capabilities to the Chotubot / Mochi Avatar system.

---

## 2. Hardware Architecture & Components Specification

```
                  +-----------------------------------+
                  |   ESP32-C3 Main Controller Board  |
                  |     (160MHz RISC-V, 400KB SRAM)   |
                  +-----------------+-----------------+
                                    |
          +-------------------------+-------------------------+
          | I2S Shared Bus (BCLK / WS)                        |
          v                                                   v
+-------------------+                               +--------------------+
|  INMP441 I2S Mic  |                               | MAX98357A I2S DAC  |
| (Digital MEMS Mic)|                               |  & Class-D Amp     |
+-------------------+                               +---------+----------+
                                                              |
                                                              v
                                                    +--------------------+
                                                    | 4Ω 2W Micro Speaker|
                                                    +--------------------+
```

### Required Modules

| Component | Recommended Model | Specifications & Description | GPIO Pins Required (ESP32-C3) |
| :--- | :--- | :--- | :--- |
| **Digital MEMS Mic** | `INMP441` or `MSM261S4030H0` | 24-bit I2S digital output, high SNR (61 dBA), integrated ADC. | `GPIO 2` (SCK), `GPIO 3` (WS), `GPIO 4` (SD) |
| **I2S DAC + Amplifier** | `MAX98357A` | Mono Class-D amplifier with integrated I2S DAC, 3.2W output into 4Ω. | Shared `GPIO 2` (BCLK), Shared `GPIO 3` (LRC), `GPIO 5` (DIN) |
| **Speaker Driver** | 28mm Neodymium Micro Speaker | 4Ω or 8Ω, 2W–3W RMS power, closed acoustic chamber enclosure. | Connected directly to `MAX98357A` `+` and `-` output terminals |

> **Wiring Efficiency Note**: By sharing the **Bit Clock (`BCLK/SCK`)** and **Word Select (`LRC/WS`)** lines between the INMP441 Mic and MAX98357A Amp, the total audio subsystem requires **only 4 GPIO pins** on the ESP32-C3!

---

## 3. Voice Assistant Architecture (Wake-Word + Cloud AI)

```
[User Voice Command] ➔ [INMP441 Mic] ➔ [ESP32-C3 Local Wake-Word (ESP-SR)] ➔ (Activated!)
      ➔ [Stream Audio via WiFi WebSocket] ➔ [Cloud STT (Whisper/Deepgram)]
      ➔ [Cloud LLM (Gemini 1.5 Flash)] ➔ [Cloud TTS (Google/ElevenLabs)]
      ➔ [Stream PCM Back over WiFi] ➔ [ESP32-C3 I2S DMA Buffer]
      ➔ [MAX98357A Amp] ➔ [Speaker Output] ➔ [Sync OLED Face Reactions!]
```

### Onboard vs. Cloud Execution Matrix

- **Onboard Execution (ESP32-C3)**:
  - **Wake-Word Engine**: Runs **ESP-SR** (Espressif Speech Recognition) or TensorFlow Lite Micro for low-power offline wake-word detection ("Hi Mochi" / "Alexa"). Uses ~18% CPU and 60KB SRAM.
  - **I2S DMA Streaming**: Double-buffered PCM audio transport over WiFi WebSockets.
- **Cloud Execution**:
  - **Speech-to-Text (STT)**: Whisper API / Deepgram (Fast transcript generation < 180ms).
  - **Intelligence (LLM)**: Gemini 1.5 Flash / OpenAI GPT-4o-mini (Streaming tokens < 250ms).
  - **Text-to-Speech (TTS)**: ElevenLabs / Google Cloud TTS (Chunked audio streaming < 150ms).

---

## 4. Real-Time Audio DSP Equalizer & Spectrum Analyzer

### 3-Band Biquad IIR Equalizer
Implemented using `esp-dsp` (optimized C/assembly for RISC-V), processing 16-bit 16kHz PCM audio buffers in real time:

1. **Bass Filter (Low Shelf)**: $20\text{ Hz} - 300\text{ Hz}$ frequency adjustment ($\pm 12\text{ dB}$).
2. **Midrange Filter (Peaking)**: $300\text{ Hz} - 3\text{ kHz}$ frequency adjustment ($\pm 12\text{ dB}$).
3. **Treble Filter (High Shelf)**: $3\text{ kHz} - 8\text{ kHz}$ frequency adjustment ($\pm 12\text{ dB}$).

### 32-Bin Visual Spectrum Analyzer
- **OLED Display (`faces.h`)**: Computes a 32-point Radix-2 FFT (`dsps_fft2r_fc32`) on audio DMA buffers to render real-time frequency bar graphs or pulsing spectrum waveforms along the bottom of the 128x64 SH1106 OLED screen (`y = 52..64`).
- **Web Avatar Component (`mochi_chotubot_face_component.html`)**: Connects Web Audio API `AnalyserNode` to drive 60FPS CSS/SVG visualizer bars and sound-reactive face reactions.

---

## 5. Latency Budget Analysis

```
┌─────────────────────────┬───────────────────┬──────────────────────────────────────────┐
│ Pipeline Stage          │ Duration (ms)     │ Optimization Method                      │
├─────────────────────────┼───────────────────┼──────────────────────────────────────────┤
│ Local Wake-Word Detect  │ 40ms - 80ms       │ Quantized ESP-SR CNN model               │
│ WiFi Audio Upload (Tx)  │ 50ms - 100ms      │ Binary WebSocket PCM stream              │
│ Cloud STT + LLM (Gemini)│ 200ms - 350ms     │ Streaming response tokens                │
│ Cloud TTS Generation    │ 120ms - 200ms     │ Chunked audio transfer encoding          │
│ I2S DMA Speaker Buffer  │ 20ms - 40ms       │ Ring buffer size 512 bytes               │
├─────────────────────────┼───────────────────┼──────────────────────────────────────────┤
│ TOTAL END-TO-END        │ ~430ms - 770ms    │ Conversational Latency                   │
└─────────────────────────┴───────────────────┴──────────────────────────────────────────┘
```

---

## 6. Sound-Reactive Avatar Synchronization Matrix

| Audio Parameter | Frequency Band / Metric | Avatar Visual Reaction | Implementation Method |
| :--- | :--- | :--- | :--- |
| **Speech Amplitude** | RMS Energy ($300\text{Hz} - 3\text{kHz}$) | Dynamic Mouth Open/Close (`Q 140 ${depth}`) | Real-time RMS modulating mouth curve in `faces.h` & Web SVG |
| **Bass Beat Kick** | Low Frequency ($60\text{Hz} - 150\text{Hz}$) | Head & Eye Squash/Bounce (`scale(1.06, 0.94)`) | Low-pass FFT bin triggering `impact-bounce` keyframe |
| **Treble Transient** | High Frequency ($4\text{kHz} - 8\text{kHz}$) | Eye Catchlight Shine & Sparkle Particles | High-pass FFT bin adjusting sparkle particle opacity |

---

## 7. Power & Thermal Budget Analysis

- **Current & Power Draw**:
  - **ESP32-C3 MCU (WiFi Active)**: $\sim 150\text{ mA} @ 3.3\text{V}$ ($\sim 0.5\text{W}$).
  - **MAX98357A Amp + 2W Speaker (Peak)**: $\sim 500\text{ mA} @ 5\text{V}$ ($\sim 2.5\text{W}$).
  - **Total System Peak Load**: $\sim 650\text{ mA} @ 5\text{V}$ ($\sim 3.25\text{W}$).
  - **Power Source Recommendation**: Powered via USB-C (5V 1A) or 2000mAh 18650 LiPo battery with 5V boost converter.
- **Thermal Management**:
  - MAX98357A Class-D amplifier efficiency $>90\%$ ($\sim 32^\circ\text{C}$ operating temp).
  - ESP32-C3 under continuous FFT DSP + WiFi streaming stabilizes around $\sim 44^\circ\text{C}$, well below the $85^\circ\text{C}$ rating.

---

## 8. Practical Implementation Roadmap

### Option A: Minimal Hardware Add-on (Recommended)
- **Modifications**: Retain current ESP32-C3 board; add INMP441 Mic + MAX98357A Amp + 2W Speaker.
- **Capabilities**: Local Wake-Word + Cloud Voice Assistant + 3-Band DSP Equalizer + 32-bin OLED Spectrum Analyzer + 60FPS Sound-Reactive Avatar Reactions.

### Option B: Full Hardware Redesign (Offline Local Voice Commands)
- **Modifications**: Upgrade MCU to **ESP32-S3** (Dual-core LX7 @ 240MHz with Vector extension + 8MB PSRAM) + Dual MEMS Mic Array.
- **Capabilities**: Fully offline local voice command recognition (up to 100 offline commands without internet), Acoustic Echo Cancellation (AEC), and stereo DSP equalization.

---
*Documentation generated for inclusion in future product specifications and hardware design reviews.*
