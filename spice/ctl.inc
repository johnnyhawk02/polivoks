* A1/V1 control converter (sheet 7) with panel network (sheet 11)
* summing node "sum" = A1 inverting input = V1 base
R1   vp   sum  100k
* cutoff pot R90 100k (+12.5 .. 0) wiper -> R87 47k.  Linear taper     EST
R90a vp   wc   {max(100k*(1-pc),1)}
R90b wc   0    {max(100k*pc,1)}
R87  wc   sum  47k
* envelope amount: R96 wiper -> R88 100k.  venv = envelope*amount   (0..6 V)
VENV env  0    {venv}
R88  env  sum  100k
XA1  0 sum vp vn a1o K140UD8
R2   sum  a1o  3k
QV1  col  sum  a1o KT315G
