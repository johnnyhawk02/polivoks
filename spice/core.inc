* ============================================================================
*  Polivoks VCF core, sheet 7 (У4) + panel wiring, sheet 11.
*  Node names: in (mixer output), bp (A2 out, X4/3), lp (A3 out, X4/4),
*  col (V1 collector).  Parameters: pr = resonance knob 0..1,
*  Values read from the scans.  R85 "39k" is faint but legible.
* ============================================================================
VP vp 0 12.5
VN vn 0 -12.5
* --- signal input network (A2 inverting node "n2") --------------------------
R85  in   n2  39k
R3   lp   n2  47k
R4   n2   0   1k
* resonance: R89 100k pot from bp (pin 1) to ground (pin 3), wiper -> R54 47k
* knob fully up = wiper at the ground end.  Linear taper            EST
R89a bp   w   {max(100k*pr,1)}
R89b w    0   {max(100k*(1-pr),1)}
R54  w    n2  47k
XA2  0 n2 vp vn bp iset2 UA776
* --- A2 -> A3 coupling --------------------------------------------------------
R6   bp   n3  47k
R7   n3   0   1k
XA3  n3 0 vp vn lp iset3 UA776
* --- Iset: V1 collector feeds both Iset pins through 110k ------------------
R5   col  iset2 110k
R8   col  iset3 110k
* --- load on the outputs: S54 picks one; VCA input ~ 100k               EST
RLbp bp 0 100k
RLlp lp 0 100k
