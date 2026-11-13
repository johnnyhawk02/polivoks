# VCF check in ngspice

A SPICE netlist of the Polivoks filter board (sheet 7, У4) and the panel
parts that hang off it (sheet 11), used to check the JS filter in `dsp.js`.
Needs ngspice (`brew install ngspice`).

## Files

| file | what |
|---|---|
| `models.lib` | uA776 / К140УД12 at transistor level, built from the SGS-Thomson UA776 datasheet schematic (Q1–Q24, R1–R8, C1); КТ315Г, КТ361Б; a behavioural КР140УД8 for A1 |
| `core.inc` | A2, A3, R3–R8, R85 39k input, resonance pot R89 + R54, Iset resistors R5/R8 |
| `ctl.inc` | A1 + V1 converter (R1 100k, R2 3k), cutoff pot R90 + R87 47k, envelope R88 |
| `t_opamp.cir` | op-amp alone: gain, GBW, slew at Iset 1.5 / 15 / 100 µA |
| `t_ac.cir` | f0, Q, BP peak vs V1 current and resonance knob |
| `t_osc*.cir` | self-oscillation at full resonance |
| `t_ctl.cir` | cutoff knob → V1 current |
| `t_od.cir` | overdrive: sine at 300 Hz / 2.4 kHz, 0.5–10 V |
| `compare.js`, `compare_od.js` | run the JS filter on the same cases and print both |

Run any bench with `ngspice -b t_ac.cir`, and the comparisons with
`node spice/compare.js` and `node spice/compare_od.js`.

## What is read from the scans and what is estimated

Read from the schematics: every resistor on sheet 7's filter part, R85 39k
(faint but legible), R54 47k, R89 100k, R87 47k, R88 100k, R86 100k (sheet 11),
the uA776 internal topology and its labelled values (datasheet).

**EST (estimated):**
- uA776 C1 = 25 pF (fits datasheet SR 0.8 V/µs at 15 µA, GBW 0.1 MHz at 1.5 µA)
- uA776 device models, the unlabelled output resistor (100 Ω), Q13 ×2 and Q12 ×5
  areas (so supply current and output current match the datasheet table)
- КТ315Г Is = 2e-14, β = 150
- pot tapers: cutoff R90 log, resonance R89 and amount pots linear
- LFO bus level into R86

## Results

uA776 model vs datasheet (typ): at Iset 15 µA GBW 1.03 MHz (0.7), SR 0.84 V/µs
(0.8), supply 190 µA (160); at 1.5 µA GBW 0.10 MHz (0.1), supply 25 µA (20).

Filter, small signal (ngspice / JS):

| V1 current | res | f0 Hz | Q |
|---|---|---|---|
| 1 µA | 0 | 575 / 631 | 1.08 / 1.01 |
| 1 µA | 0.5 | 582 / 631 | 3.22 / 3.29 |
| 1 µA | 0.8 | 582 / 631 | 7.0 / 7.2 |
| 10 µA | 0 | 6310 / 6166 | 1.05 / 1.02 |
| 10 µA | 0.95 | 6383 / 6310 | 22.7 / 21.7 |

- Cutoff is linear in Iset (≈580 Hz per µA of V1 current) up to V1 saturation
  at ≈224 µA (≈130 kHz).
- The low-pass passband gain is 1.205 (47k/39k).
- Minimum resonance is Q ≈ 1. The old JS went down to 0.47.
- Resonance follows the pot network: Q ≈ (47 + 100p(1−p)) / (0.98·47p),
  p = 1 − knob.
- Full resonance puts the loop right at the edge of oscillation. In ngspice it
  builds up slowly (≈0.2 s) or dies out depending on the time step, so the
  real unit's self-oscillation comes down to parasitics no model here pins
  down. The JS adds a small negative damping (0.5 % of the LP weight) so the
  very end of the knob oscillates.
- Cutoff knob: 6 µA of summing current per octave (V_T·ln2 / 3k), not
  temperature compensated. The envelope at full amount spans ≈10 octaves.

Overdrive, LP output, Iset 1 µA, res 0.5 (ngspice / JS):

| input | AC rms | THD % | DC shift V |
|---|---|---|---|
| 300 Hz, 0.5 V | 0.452 / 0.450 | 0.55 / 0.02 | −0.12 / −0.08 |
| 300 Hz, 10 V | 9.31 / 9.00 | 14.6 / 8.5 | −0.32 / −0.14 |
| 2.4 kHz, 2 V | 0.553 / 0.544 | 0.91 / 1.10 | −0.22 / −0.19 |
| 2.4 kHz, 10 V | 1.14 / 1.06 | 3.35 / 3.46 | −1.55 / −1.53 |

The DC shift under hard drive comes from the uA776 slewing about 20 % faster
down than up, which the JS now includes. Not modelled in JS: the small
crossover distortion of the class-AB output at low Iset (the 0.55 % at 300 Hz).

The oscillator board (sheet 5) has its own bench and notes in `vco/README.md`.
