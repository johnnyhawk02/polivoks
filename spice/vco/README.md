# VCO check in ngspice (sheet 5, У2/У3)

The Polivoks oscillator board, transcribed from `sch_polivoks5-vco1vco2.jpg`,
and an ngspice bench of its core used to build the JS `VCO` in `dsp.js`.

Run one case with `ngspice -b core.cir`, or the pitch sweep with
`node spice/vco/sweep.js [currents in A…]` (writes `sweep.json` when
`JSON=sweep.json` is set; `PARAMS="sr6=2 isc6=20m sr7=2"` and `IL=10n` vary
the estimated op-amp and leakage values).

## Transcription

**Reference.** A6 КР140УД8Б, R15 2.21k from +12.5 V and R16 10k to ground on
pin 3, follower with R17 3.3k: Vref = +10.24 V (the sheet's check-point table
gives +10 V on A6 pins 2, 3, 6).

**Timing.** C5 5600 pF (К31-11) from Vref to node X. The expo collector,
A4 pin 10, sinks current from X, so X ramps down from about +8.6 V to +0.6 V.

**Reset.** V1 КТ361Г (emitter on Vref, base to V5's collector, collector to
V2 КД521Б), V5 КТ315Г (emitter on X, base on node Y), V2 cathode on Y. V1 and
V5 make a PNP/NPN latch across C5. V6 КТ315Г is diode-connected from Y to Z.
R18 6.19k (from Vref) and R19 6.19k (to ground) put Z at 5.1 V through 3.1k.
V7 КТ315Б, emitter grounded, collector on Z.

**Buffer.** R20 22k from X into A7 pin 3; A7 КР140УД8Б as a follower; R21
3.3k from A7's output to V7's base. Saw test point on A7's output, drawn as a
falling ramp 0 … +10 V.

How it runs: while the ramp is high, A7 drives V7 through R21, V7 holds Z near
0 V and V6 clamps Y, so the latch can't fire. Near 0.6 V V7 runs out of base
current, Z rises, the latch fires and dumps C5 in about 0.35 µs. A7 slews back
up at 2 V/µs, V7 pulls Z down and the latch lets go.

**Shapers.**
- Saw: C8 30 µF (К50-6) and R29 6.8k AC-couple A7's output (node S); S goes
  out through R24 20k.
- Triangle: A8 КР140УД8Б with V3/V4 КД521Б, R28 100k, R31 100k, R27 100k: a
  precision rectifier giving −(|S| − Vf), drawn as 0 … −5 V, then C9 50 µF.
- Pulse: A10, S into (−) through R33 20k, (+) to R34 20k and the pulse-width
  switch line (X2 pin 10), output through R35.

**Expo and CV (unchanged in the JS apart from the series resistance).** A4
КР198НТ1А: the expo transistor's base (pin 11) sits on R4 1k / R5 100 Ω from
the A2 summer, with C2 100 pF; the reference transistor (pins 13/14) runs from
A3 with R7 6.19k and C3 2200 pF, its current set by R9 100k and trimmer R30
100k from +12.5 V. A5 КМ551УД1Б with R10 1k trimmer, R22 470, R23 100 Ω ±0.5,
R11 6.2k, R12 8.2k and R14 75 Ω holds the chip's temperature (heater loop).
A1, A2 КР140УД8Б with R1 100k, R2 22.1k, R3 1k sum the CVs.

## What is read and what is estimated

Read from the sheet: all values above, part types from the parts table
(КР140УД8Б for A1–A3 and A6–A8; КР198НТ1А A4; КМ551УД1Б A5), and the
saw and triangle test-point levels.

**One junction is a reading, not a certainty.** The sheet draws A7 pin 2, R21
and V7's base meeting at one point. Taken literally A7 can't act as a follower
(V7's base-emitter junction would hold pin 2 at 0.7 V). I tried every way of
joining A7, R20, R21, V7 and Z that the scan allows. Only "A7 pin 2 on its own
output, R21 to V7's base" runs cleanly and gives the sheet's test-point levels
(saw ≈ 0.6 … 8.6 V, triangle 0 … −3.4 V). The rest either stall, latch up, or
give a saw of a few volts. **EST**

**EST (estimated):**
- КР140УД8Б: GBW 1 MHz, slew 2 V/µs, output limit 20 mA (`ud8.lib`)
- V1 leakage 10 nA (the latch's seed current)
- КД521Б diode model, КТ315/КТ361 models (from `../models.lib`)
- In the JS: A10 slew 3 V/µs, the narrow-pulse level (13 % duty at 450 Hz), C9's load
  (100k), and the КР198НТ1А RE 1 Ω, rbb' 100 Ω, β 150

## Results

Pitch of the core alone, ideal current sink, against 1 µA (≈22 Hz):

| I | f Hz | cents | A7 low…high V |
|---|---|---|---|
| 20 µA | 449 | −2.5 | 0.59 … 8.59 |
| 80 µA | 1789 | −7.6 | 0.58 … 8.51 |
| 160 µA | 3568 | −12.9 | 0.57 … 8.45 |
| 320 µA | 7101 | −21.4 | 0.55 … 8.33 |
| 640 µA | 14087 | −35.4 | 0.53 … 8.11 |
| 1.28 mA | 27797 | −58.7 | 0.49 … 7.72 |

This is the reset's share of the high-note flattening. The cap swing per
cycle fits ΔV(I) = 7.948 + 35.51·I^0.73 V within 0.15 cents, and the JS VCO
uses that fit. It barely moves with the estimates: A7 slew 2 → 5 V/µs, A6
output limit 10 → 40 mA, or leakage 1 → 100 nA each change the 14 kHz figure
by less than 2 cents.

JS tracking against 440 Hz (one VCO, no drift or mismatch), with the expo
series resistance (≈2.3 Ω) and with it set to zero:

| note | Hz | full | rb = 0 |
|---|---|---|---|
| A1 | 55 | +4.8 | +2.2 |
| A4 | 440 | 0 | 0 |
| A5 | 880 | −4.8 | −1.9 |
| A6 | 1760 | −13.7 | −4.9 |
| A7 | 3520 | −30.3 | −10.0 |
| A8 | 7040 | −61.3 | −18.5 |

So about a third of the flattening comes from the reset and two thirds from
the expo pair's series resistance, which rests on the estimated КР198НТ1А
values. The sheet has no high-frequency compensation, so the real unit should
go flat by about this much unless it was trimmed on the CV side.

## CV summer and panel inputs (`summer.cir`, `node summer.js`)

A2's inverting input (X2 pins 3/4) is a virtual earth; R2 22.1k feedback,
R3 1k on (+). A1 buffers "Регистры" (X2 pin 1) into R1 100k. From sheet 1,
VCO I's node takes the keyboard bus through R65 100k, "Модуляция" R67 100k
(modulation bus on the top, ground on the bottom) through R62 47k, and
"Генератор II": VCO II's triangle through R64 100k onto R66 100k, wiper through
R63* 100k (* = selected on test, **EST**). VCO II's node takes its bus through
R78 100k, "Модуляция" R80 / R76 47k, and "Расстройка" R79 100k across ±12.5 V
through R77 1.0 MΩ. "Настройка" (R57, through the selected R54 / R81) and the
"Смещ." trims (R118 / R124 with R128 / R129 20k, through R120 / R126 360k) are
left at the JS's ±2 semitone tune and zero.

The keyboard is 1.5 V/octave into 100k, so 15 µA is one octave; a positive
current lowers the pitch (the 32' end of the register ladder is positive).
SPICE against the JS formulas (`summer.txt`):

| case | SPICE oct | JS oct |
|---|---|---|
| register step 1.49 V | −0.993 | (−1, ladder) |
| mod pot 0.25, bus +1.43 V | −0.3625 | −0.3625 |
| mod pot 0.5 | −0.6620 | −0.6620 |
| mod pot 1 | −2.0283 | −2.0284 |
| FM pot 1, triangle +1 V | −0.2222 | −0.2222 |
| detune ends | ±0.8333 | ±0.8333 |

So full modulation is ±2.03 octaves for the ±1.43 V triangle (it was scaled
to ±1 octave before), full FM ±0.38 octave for VCO II's ±1.7 V triangle, and
detune ±10 semitones (was ±7). Pot tapers linear **EST**; which way detune
turns is not on the sheet (kept sharp to the right, **EST**).

## Pulse width (an addition, `pw.cir`, `node spice/vco/pw.js`)

Not on the original panel. A10 (+) has R34 20k to ground and the panel's
pulse-switch line (X2 pin 10), so the addition goes there: a 100k linear pot
from 0 V to −12.5 V, wiper through 56k onto A10 (+) (pot and 56k chosen, not
from the Polivoks). Knob 0 puts 0 V there, the original square; knob 1 puts
−3.29 V there, so A10 trips near the bottom of the ramp. The bench adds C8/R29,
an estimated 100k load for A8, and A10 as the open-loop ud8.lib op-amp (slew
3 V/µs **EST**). Duty (A10 output > 0), SPICE | JS (`pw_js.js`, full table in
`pw_compare.txt`):

| knob | 450 Hz | 1.8 kHz | 3.6 kHz | 7.1 kHz | 14 kHz |
|---|---|---|---|---|---|
| 0 | 49.9 \| 48.8 | 48.1 \| 47.8 | 47.3 \| 47.3 | 46.7 \| 46.8 | 46.4 \| 46.5 |
| 0.5 | 34.2 \| 33.2 | 32.4 \| 32.1 | 31.6 \| 31.3 | 30.8 \| 30.4 | 30.1 \| 29.2 |
| 0.8 | 22.3 \| 21.4 | 20.5 \| 20.2 | 19.6 \| 19.3 | 18.7 \| 18.1 | 17.8 \| 16.2 |
| 0.9 | 16.3 \| 15.4 | 14.5 \| 14.1 | 13.6 \| 13.2 | 12.6 \| 11.8 | 11.2 \| 4.1 |
| 1 | 8.1 \| 7.2 | 6.3 \| 5.9 | 5.4 \| 4.9 | 2.6 \| 0 | 0 \| 0 |

The pitch doesn't move (within 0.3 cents in SPICE). The square sits a little
under 50 % because A10's finite gain-bandwidth delays the edge where the slow
ramp crosses its threshold (33 µs at 450 Hz in SPICE). At the top, the narrowest
pulses get too short for A10 to reach full swing and fade out. In the JS they
fade out about an octave earlier than in SPICE, because the 4× oversampled step
(5.2 µs) blurs the bottom of the ramp.

With the switch on the narrow pulse, A10 (+) already sits at ≈ −2.85 V, and
the full pot on top of that put the threshold below the ramp, so the output
went silent past about 40 % on the knob (v1.20.0). From v1.21.0 a second wafer on
the switch swaps the 56k for 560k in that position (chosen, **EST** as wiring):
the knob narrows 13 → 7 % at 450 Hz and ends on the same −3.3 V floor.
`node test.js` renders the whole knob range and fails if the RMS drops below
0.2 of its knob-0 level.
