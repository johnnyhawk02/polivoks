# Mixer check in ngspice (sheet 9, У6)

`node spice/mixer/mix.js` builds one netlist per waveform and pot setting,
runs ngspice and prints the gain next to `mixGain()` from `dsp.js`.

## Transcription

**Mixer board.** A2 КР140УД8Б inverting summer: R17 22k (Генер. II, X6 pin 7),
R7 22k (Генер. I, pin 8), R8 22k (noise, pin 9), R9 22k (external, pin 10),
R10 22k feedback, R11 10k from pin 3 to ground. Output through C2 0.22 µF to
X6 pin 11 ("~0,5 В" on the sheet). The filter takes it through R85 39k
(sheet 11), so C2 makes an 18 Hz high-pass.

The rest of the board is the phones amplifier: A4 КР140УД8Б with R15 10k /
R14 10k (gain 2), V3 КТ815Г / V4 КТ814Г push-pull, R16 120 Ω. Not modelled.

**Panel (sheet 1).** Each source goes to the top of a 100k pot (R104 Генер. I,
R103 Генер. II, R105 Шум, R106 Внеш.), bottom to ground, wiper to the board.
So each channel's gain from the source's open-circuit voltage V is

    W = 1 / (1 + (Ra + Rs)·(1/Rb + 1/22k)),   Ra = 100k(1−t), Rb = 100k·t

where Rs is the source's own resistance (sheet 5): saw through R24 20k,
triangle straight from A8 through C9, pulse from A10 through R35. With the
22k load at full level the saw drops to 0.47 and the pulse to 0.6, which
puts all three waves at about ±2 V into A2.

## What is estimated

- R35 reads "?0к" (30k taken) and the resistor from its output to ground is
  unreadable (20k taken). Together they put the pulse at ±4.4 V behind 12k.
  **EST**
- The panel pot taper (linear, group А). **EST**
- Noise level at the modulator's A2 (0.25 V rms) and the external input
  (1 V peak). **EST**

## Results

The closed form and ngspice agree to 4 digits for every wave and pot setting
(the op-amp's own gain error is below 0.01 %). At t = 1: saw 0.474, triangle
1.000, pulse 0.600; at t = 0.5: 0.179, 0.234, 0.198. C2 / R85: 0.70 of
passband at 18 Hz. A2 clips at ±11.4 V, which two full-level pulses reach only
with the other channels up as well.
