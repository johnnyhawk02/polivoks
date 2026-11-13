# VCA check in ngspice (sheet 8, У5)

`ngspice -b dc.cir` sweeps the two tail currents; `node spice/vca/tr.js`
runs 1 kHz sines through the board (`JSON=tr.json` saves the results) and
`node spice/vca/compare.js` runs the JS `VCA` on the same cases.

## Transcription

**К118УД1Б** (`k118.lib`), from the datasheet's principal schematic: a
differential pair with 4k collector loads R1 / R3 from pin 7 (inputs 3 and
10, outputs 5 and 9), current source VT3 (base pin 12, emitter pin 2, R2 1.8k
to pin 14), R4 4k pin 12 → pin 11, R6 5.7k pin 11 → pin 8, and R5 1.7k plus a
diode-connected transistor from pin 12 to pin 14. On the board pin 7 is
+12.5 V and pin 14 ground.

**Bias.** R10 20k / R11 20k divider, C2 100 µF, V1 КТ315Г follower with R12
6.2k: +5.5 V (the sheet says +6 V; check-point table: A1 pins 3 and 10 at +6).

**Stage 1 (A1, A2): modulation.** Filter output (X5 pin 1) through C1 10 µF
and R2 20k onto pin 3, R4 200 Ω to the bias; pin 10 via R5 200 Ω to the bias,
and R3 20k from the trimmer R1 68k. Tail: X5 pin 4 ("Вх. упр.", the panel
"Модуляция" pot on the modulation bus) through R6 100k into pin 12, and R7
27k from pin 2 to −12.5 V. A2 КР140УД8Б takes pin 5 on (−) and pin 9 on (+),
R9 200k feedback, R8 200k to ground: Vout = 200k·(Ic1 − Ic2).

**Stage 2 (A3, A4): envelope.** A2's output through R13 20k / R16 200 Ω onto
pin 3, pin 10 via R17 200 Ω and R15 20k from trimmer R14. Tail: the envelope
(A6, 0…6 V) through R18 100k into pin 12; pin 2 open, so the chip's own
mirror (R5 + diode against R2) sets the current. A4 as A2 with R20 / R19
200k. Output through C3 50 µF.

Both op-amps sit with their inputs at about +12 V, as the sheet's check-point
table says (A2 pins 2, 3: +12).

## What is estimated

- On-chip transistors: IS 1e-15, β 120, VAF 80 (`QK`). **EST**
- The trimmers: set so each pair is balanced at rest (stage 1's wiper at the
  bias, stage 2's at 0 V, the DC level of A2's output). In the JS a residual
  offset of 0.1 mV / 0.2 mV is left for the envelope thump. **EST**
- КР140УД8Б: the behavioural `K140UD8` from `../models.lib`. **EST**

## Results

Tail currents (SPICE / JS, µA):

| stage 1, X5 pin 4 | −0.3 V | 0 | +0.5 V | +1.5 V |
|---|---|---|---|---|
| SPICE | 0.13 | 57.6 | 244.7 | 404.7 |
| JS | 0.1 | 55.7 | 238.1 | 400.3 |

| stage 2, envelope | 1 V | 3 V | 6 V |
|---|---|---|---|
| SPICE | 4.29 | 22.9 | 50.6 |
| JS | 4.1 | 22.3 | 49.6 |

So the modulation knob at zero leaves stage 1 idling at about 58 µA (gain
≈2.1); a negative swing of 0.4 V shuts it, a positive one raises it sevenfold.
Stage 2 is dead below about 0.6 V of envelope and then linear at ≈9.3 µA per
volt (gain ≈1.9 at the top). The sheet's levels, ≈1 V at A2 and ≈2.2 V at A4
with a key held, fit these gains.

Sine p-p at 1 kHz, small to clipping (SPICE / JS): 0.5 V in, envelope 6 V:
A2 2.15 / 2.11, A4 4.03 / 3.92. 2 V in: A2 8.23 / 8.07, A4 13.1 / 12.8.
10 V in: A2 21.7 / 19.8 (the SPICE op-amp clips harder at ±11.5 V; the JS
uses its usual soft ±11 V rail). The small-signal gap of 2–4 % comes from the
tail currents above (base resistance and Early effect, not in the JS).
