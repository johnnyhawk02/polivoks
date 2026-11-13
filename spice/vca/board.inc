* VCA board (sheet 8, У5), signal path.  Parameters: vmod (V at X5 pin 4,
* i.e. after the panel "Модуляция" pot), venv (A6 envelope, 0..6 V).
* Input: node fin (filter output, X5 pin 1).
* Bias: R10 20k / R11 20k divider, C2 100u, V1 КТ315Г follower, R12 6.2k
*  -> node bias (+6 V on the sheet).
R10 vp vb 20k
R11 vb 0 20k
C2 vb 0 100u
Q1b vp vb bias KT315G
R12 bias 0 6.2k
* --- stage 1 (A1 + A2): modulation ---
C1 fin c1 10u
R2 c1 a1p3 20k
Rb4 a1p3 bias 200
Rb5 a1p10 bias 200
* offset trims R1, R14 (68k) through R3, R15 20k: set so each pair is
* balanced at rest (stage 1: wiper at the bias, since C1 blocks DC; stage 2:
* wiper at 0 V, the DC level of A2's output on R13).  Factory trim, EST
R3 a1p10 trim1 20k
Vtrim1 trim1 bias 0
Vmod mod 0 {vmod}
Rb6 mod a1p12 100k
R7 a1p2 vn 27k
XA1 a1p2 a1p3 a1p5 vp nc18 a1p9 a1p10 nc11 a1p12 0 K118UD1
R8 a2p 0 200k
Rb9 a2m a2o 200k
* pin 5 -> A2 (-), pin 9 -> A2 (+)
Rw1 a1p5 a2m 1m
Rw2 a1p9 a2p 1m
XA2 a2p a2m vp vn a2o K140UD8
* --- stage 2 (A3 + A4): envelope ---
R13 a2o a3p3 20k
R16 a3p3 bias 200
R17 a3p10 bias 200
R15 a3p10 trim3 20k
Vtrim3 trim3 0 0
Venv env 0 {venv}
R18 env a3p12 100k
XA3 a3p2 a3p3 a3p5 vp nc28 a3p9 a3p10 nc21 a3p12 0 K118UD1
R19 a4p 0 200k
R20 a4m a4o 200k
Rw3 a3p5 a4m 1m
Rw4 a3p9 a4p 1m
XA4 a4p a4m vp vn a4o K140UD8
C3 a4o out 50u
Rload out 0 10k
