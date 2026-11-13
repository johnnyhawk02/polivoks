# Modulator check in ngspice (sheet 10, У7)

`ngspice -b lfo.cir` (oscillator against the "Частота" setting),
`ngspice -b noise.cir` (noise chain AC response) and
`node spice/lfo/compare.js` (the JS `Modulator` on the same cases).

The sheet is printed sideways; read it rotated 90° anticlockwise.

## Transcription

**Oscillator.** A5 КР140УД8Б as a Schmitt trigger: triangle on (−), R13 100k
from the output to (+), R14 15k from (+) to ground, so it flips at
±Vsat·15/115 = ±1.43 V. Its output charges C7 10 µF (other end on −12.5 V)
through R21 4.3k and the panel "Частота" R107 100k, a rheostat across X7
pins 4 and 5 (sheet 1). A6 buffers C7 (X7 pin 6, drawn ±1.5 V). V6 КД521В,
R16 100k / R17 15k and A7 give the square (X7 pin 7, drawn 0 / +1.5 V).
R15 6.8k drives the rate LED (X7 pin 8).

**Noise.** V1 КТ315Б junction from +12.5 V through R1 100k, C1 0.01 µF, C2
100 pF, R2 100k → A1 (×1 + 560k/220k) → C3 10 µF, R5 1k → A2 (R6 100k,
×100), drawn ±1.5 V: the noise to the mixer (X7 pin 1). Then C4 0.01 µF, R7
82k, C5 0.01 µF, R8 100k → A3 (×1 + 560k/10k, C9 10 µF): the control noise
(X7 pin 2), drawn ±1.5 V.

**Random steps.** A3's output through КП303В V3 onto C6 0.22 µF, A4 follower
(X7 pin 3). V3's gate: R12 820k, V2 КД521В from the V4 КТ315Г pulse shaper,
which C8 1000 pF couples to A5's output; the sheet draws a 0.2 ms pulse.

**Panel "Режим" S58** picks triangle (X7 6), square (7), random steps (3) or
noise (2) for the modulation bus.

## What is estimated

- КР140УД8Б: `../vco/ud8.lib` with `r1=3.2g` (open-loop gain 2e5) and
  `kc=0.1` (internal clamp, so a saturated comparator recovers properly).
  The VCO sweep used the default r1, which gives Av 200 only; for A7's
  follower that is a 0.5 % level error. **EST**
- R107 taper (log). **EST**
- Noise level at A2 (0.25 V rms in the JS): the sheet draws ±1.5 V at both A2
  and A3, but the chain between them has a gain of 20 at its peak, so both
  cannot be right. **EST**
- V3 on-resistance 300 Ω, and sampling on A5's falling edge. **EST**

## Results

| R107 | SPICE Hz | JS Hz |
|---|---|---|
| 0 | 43.98 | 44.28 |
| 1k | 35.70 | 35.93 |
| 10k | 13.27 | 13.32 |
| 100k | 1.825 | 1.83 |

Triangle ±1.43 V in both; square 0 … +1.38 V (SPICE) / +1.36 V (JS).

Control-noise gain, A3 out over A2 out: 25 Hz 8.3 / 8.3, 158 Hz 20.2 / 20.0,
794 Hz 11.8 / 11.6, 2.5 kHz 4.3 / 4.2 (SPICE / JS). A2's own band is 6 Hz to
about 15 kHz.

## What changes in the instrument

The modulation bus now carries the real levels: ±1.43 V triangle, 0 / +1.36 V
square (it only goes one way), ±1.5 V-ish steps and noise. The filter's
modulation input takes that through its R91 / R86 100k path, so filter
modulation is shallower than the old ±5 / ±11 V guess. The VCO's modulation
depth is unchanged (the bus is rescaled to the old ±1 there) until the sheet 5
summer is worked through.
