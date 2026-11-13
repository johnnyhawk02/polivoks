# Keyboard check in ngspice (sheet 3, У1, with sheet 1)

`node spice/kybd/kybd.js dc` (static voices for sets of held keys) and
`node spice/kybd/kybd.js tran` (pilot, gate, track-and-hold, voice 2, glide;
`RGLIDE=…` sets the "Глиссандо" rheostat, default 100k). Both write `kb.cir`
here and run it; `tran.txt` holds the last transient results.

The sheet is printed sideways; read it rotated 90° anticlockwise.

## Transcription

**Key string (sheet 1).** S1…S48 connect taps of R1…R47 100 Ω to one common
bus (X1 pin 5). X1 pins 1/2 and 3/4 are the two ends of the string.

**Current source.** R5 10k ±0.5 % from +12.5 V into the top of the string;
A2 КР140УД8Б sinks the current at the bottom through R10 100 Ω and holds the
top at 0 V (check-point table: A2 pins 2, 3 = 0 V). So the string carries
1.25 mA and each key step is 125 mV, i.e. 1.5 V per octave, the same scale
as the "Регистры" ladder (10k steps, ≈0.149 mA) and the 100k CV inputs.
V4/V5 КД521В clamp the top.

**Pilot.** A1 is a Schmitt oscillator (R4 100k / R2 10k hysteresis, R3 100k
into C1 1000 pF), drawn ±1.2 V, 23 kHz. Its triangle goes through R1 100k onto
A2's (+) input with R8 6.8k to ground, so the whole string (and the bus, when
a key is down) carries ≈±90 mV of it.

**Key detect.** C5 1000 pF + R17 1k from the bus into A6 (R18 220k feedback,
R9 22.1k), drawn "≈3 V 23 kHz with a key pressed". C8 0.01 µF, V1/V2 КД521В,
R20 4.3k / C10 0.01 µF rectify it. A8 compares it with R22 13k / R23 820k
(+0.195 V): −12 V key pressed, +12 V released ("Имп. запуск", R25 10k to X1
pin 10).

**Track-and-hold.** Bus → R21 1k → C9 0.22 µF → V6 КП303В → C12 0.22 µF →
A7 follower (voice 1, X1 pin 6). V6's gate sits on R29 10k from A7's output
(so Vgs ≈ 0 while tracking) and on V3 КД521В to V7 КТ315Г's collector (R19
1 MΩ to +12.5 V). V7's base is on R27 100k from A8 / R28 16k to −12.5 V:
with A8 at +12 V (released) V7 saturates and pulls the gate to −11.8 V, which
pinches V6 off.

**Voice 2.** A4: R11 22.1k from the bottom of the string, R12 22.1k from A3
(R26 16k / R6 10k trimmer / R7 16k, follower, +8.2 V on the sheet), R13 22.1k
‖ C11 0.01 µF feedback, R16 22.1k from voice 1 onto R14 ‖ R15 22.1k. Output =
voice 1 − bottom − A3. Two keys short the string between them, so the bus is
the lower key and the bottom rises by 125 mV per shorted step: A4 gives the
upper key (X1 pin 9). A3 is trimmed so one key gives voice 2 = voice 1.

**Glide.** Voice 1 → R24 1k → X1 pin 7 → "Глиссандо" R48 1.0 MΩ (rheostat,
sheet 1) → pin 8 → C4 0.22 µF (to −12.5 V) → A5 follower → X1 pin 11 "Упр.
напр.".

**Panel (sheet 1).** Pin 11 (glided voice 1) is the "Шина управляющего
напряжения генератора I". S49 "1-ГОЛ./2-ГОЛ." puts pin 6 (voice 1) or pin 9
(voice 2) on the generator II bus, without glide.

## What is read and what is estimated

**One wiring point is a reading.** The scan draws A2's (+) on the R5 / R1 /
R8 node and (−) to ground through R8, which would be positive feedback around
the string. The model puts the string top on (−) and R1 / R8 on (+), the one
reading that is stable, gives the table's 0 V on both pins, puts the pilot on
every key equally and gives the drawn ≈3 V at A6. **EST**

The table gives −8.1 V at the bottom of the string and +8.2 V from A3; 47 ×
100 Ω at 1.25 mA is 5.9 V. The model keeps the drawn resistor values (they
match the register and CV-input scaling); A3 is a trimmer, so the offset only
moves its setting.

**EST:** КП303В model (VTO −2 V, β 0.75 mA/V², so 333 Ω on), key contact
0.5 Ω, КД521В model, op-amps `../vco/ud8.lib` with r1=3.2g kc=0.1, R48 taper
(log, in the JS).

## Results

DC (`dc`), voices in keys from the top of the string:

| keys held | voice 1 | voice 2 |
|---|---|---|
| 12 | 12.000 | 12.000 |
| 5, 29 | 5.005 | 28.994 |
| 0, 47 | 0.005 | 46.994 |
| 10, 20, 30 | 10.005 | 29.994 |
| 24, 25 | 24.005 | 24.994 |

Transient (`tran`): pilot 16 kHz in the model (the КР140УД8Б slew limits it;
the sheet says 23 kHz), 185 mV p-p on the bus, 6 V p-p at A6. Gate on 8…31 µs
after a key, off 262 µs after the last key lifts. Voice 1 settles half-way in
374 µs and to 1 % in 2.3 ms (R21 into C9 + C12 in parallel). Hold: the V6
gate sits at −11.8 V, voice 1 holds to 0.01 key over 15 ms. With keys 10 and
40 lifted together, voice 2 drops from 40 to 10, voice 1's held key.
Glide with R48 = 100k: half-way in 13 ms from a part-settled start.

## In the JS (`Keyboard` in `dsp.js`)

Gate = any key down, off 262 µs after release; the envelopes only start on a
rising gate, so legato playing does not retrigger them. C9 / V6 / C12 solved
as two capacitors (backward Euler, 4 substeps); voice 2 = voice 1 + the
shorted-step offset through C11's 221 µs lag; glide RC on voice 1 for VCO I.
1-voice mode is low-note priority on both VCOs, as wired. MIDI note n is key
n − 53 (F); notes outside the 48 keys extend the string linearly.
