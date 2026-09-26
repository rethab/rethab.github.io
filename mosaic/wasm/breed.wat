;; Breeding operators on RGB genomes (3 bytes per pixel): uniform per-pixel
;; crossover and per-gene mutation, both scoring the child against the target as
;; they go. Compiled by scripts/build-wasm.js into breed-wasm.js; the JavaScript
;; reference behaviour is pinned by the golden tests.
;;
;; Random numbers come from the same mulberry32 stream as createRng in ga.js:
;; the caller hands its state over in the `rng` global and takes it back after,
;; so a run is identical whichever side draws a number.
(module
  ;; Math.log from the host, so gap lengths round exactly like the JavaScript ones.
  (import "Math" "log" (func $log (param f64) (result f64)))
  (memory (export "memory") 1)
  (global $rng (export "rng") (mut i32) (i32.const 0))

  (func $next (result i32)
    (local $s i32) (local $t i32)
    (local.set $s (i32.add (global.get $rng) (i32.const 0x6d2b79f5)))
    (global.set $rng (local.get $s))
    (local.set $t (i32.mul (i32.xor (local.get $s) (i32.shr_u (local.get $s) (i32.const 15)))
                           (i32.or (local.get $s) (i32.const 1))))
    (local.set $t (i32.xor
      (i32.add (local.get $t)
               (i32.mul (i32.xor (local.get $t) (i32.shr_u (local.get $t) (i32.const 7)))
                        (i32.or (local.get $t) (i32.const 61))))
      (local.get $t)))
    (i32.xor (local.get $t) (i32.shr_u (local.get $t) (i32.const 14))))

  ;; rng() in [0, 1).
  (func $uniform (result f64)
    (f64.mul (f64.convert_i32_u (call $next)) (f64.const 0x1p-32)))

  ;; Fills `words` crossover words, each exactly Math.floor(rng() * 2^32).
  (func (export "fillBits") (param $bits i32) (param $words i32)
    (local $end i32)
    (local.set $end (i32.add (local.get $bits) (i32.shl (local.get $words) (i32.const 2))))
    (block $done
      (loop $word
        (br_if $done (i32.ge_u (local.get $bits) (local.get $end)))
        (i32.store (local.get $bits) (call $next))
        (local.set $bits (i32.add (local.get $bits) (i32.const 4)))
        (br $word))))

  ;; Genes to skip before the next mutated one, geometric with $logSkip =
  ;; ln(1 - rate); none (and no random draw) when every gene mutates.
  (func $gap (param $logSkip f64) (param $every i32) (result f64)
    (if (result f64) (local.get $every)
      (then (f64.const 0))
      (else (f64.floor (f64.div
        (call $log (f64.sub (f64.const 1) (call $uniform)))
        (local.get $logSkip))))))

  (func $pixelError (param $g i32) (param $t i32) (result i32)
    (local $d0 i32) (local $d1 i32) (local $d2 i32)
    (local.set $d0 (i32.sub (i32.load8_u (local.get $g)) (i32.load8_u (local.get $t))))
    (local.set $d1 (i32.sub (i32.load8_u offset=1 (local.get $g)) (i32.load8_u offset=1 (local.get $t))))
    (local.set $d2 (i32.sub (i32.load8_u offset=2 (local.get $g)) (i32.load8_u offset=2 (local.get $t))))
    (i32.add (i32.add (i32.mul (local.get $d0) (local.get $d0))
                      (i32.mul (local.get $d1) (local.get $d1)))
             (i32.mul (local.get $d2) (local.get $d2))))

  ;; Changes genes of genome $g by up to +-$strength and returns the change in
  ;; squared error against target $t. Each touched pixel is scored before and
  ;; after, so the child never needs a full rescore.
  (func (export "mutate") (param $g i32) (param $t i32) (param $length i32)
                          (param $logSkip f64) (param $every i32) (param $strength f64) (result f64)
    (local $i f64) (local $offset i32) (local $end f64) (local $before i32)
    (local $addr i32) (local $delta f64)
    (local.set $i (call $gap (local.get $logSkip) (local.get $every)))
    (block $done
      (loop $pixel
        (br_if $done (i32.eqz (f64.lt (local.get $i) (f64.convert_i32_u (local.get $length)))))
        (local.set $offset (i32.mul (i32.div_u (i32.trunc_f64_u (local.get $i)) (i32.const 3)) (i32.const 3)))
        (local.set $before (call $pixelError (i32.add (local.get $g) (local.get $offset))
                                             (i32.add (local.get $t) (local.get $offset))))
        (local.set $end (f64.convert_i32_u (i32.add (local.get $offset) (i32.const 3))))
        (loop $gene
          (local.set $addr (i32.add (local.get $g) (i32.trunc_f64_u (local.get $i))))
          ;; Rounds half to even and clamps, as Uint8ClampedArray does.
          (i32.store8 (local.get $addr)
            (i32.trunc_f64_u (f64.nearest (f64.min (f64.const 255) (f64.max (f64.const 0)
              (f64.add (f64.convert_i32_u (i32.load8_u (local.get $addr)))
                       (f64.mul (f64.sub (f64.mul (call $uniform) (f64.const 2)) (f64.const 1))
                                (local.get $strength))))))))
          (local.set $i (f64.add (local.get $i)
            (f64.add (f64.const 1) (call $gap (local.get $logSkip) (local.get $every)))))
          (br_if $gene (f64.lt (local.get $i) (local.get $end))))
        (local.set $delta (f64.add (local.get $delta) (f64.convert_i32_s (i32.sub
          (call $pixelError (i32.add (local.get $g) (local.get $offset))
                            (i32.add (local.get $t) (local.get $offset)))
          (local.get $before)))))
        (br $pixel)))
    (local.get $delta))

  ;; Byte mask for one v128 of a 16-pixel group. $sw picks, per byte, which byte
  ;; of the 16-bit selector holds that pixel's bit; $bit is 1 << (pixel % 8).
  (func $mask (param $sel v128) (param $sw v128) (param $bit v128) (result v128)
    (i8x16.eq
      (v128.and (i8x16.swizzle (local.get $sel) (local.get $sw)) (local.get $bit))
      (local.get $bit)))

  ;; Sum of squared byte differences as four i32 partial sums.
  (func $sqdiff (param $x v128) (param $t v128) (result v128)
    (local $d v128)
    (local.set $d (v128.or (i8x16.sub_sat_u (local.get $x) (local.get $t))
                           (i8x16.sub_sat_u (local.get $t) (local.get $x))))
    (i32x4.add
      (i32x4.extadd_pairwise_i16x8_u (i16x8.extmul_low_i8x16_u (local.get $d) (local.get $d)))
      (i32x4.extadd_pairwise_i16x8_u (i16x8.extmul_high_i8x16_u (local.get $d) (local.get $d)))))

  ;; Writes the child of genomes $a and $b to $c and returns its squared error
  ;; against target $t. `bits` holds the words from fillBits: bit k of word w
  ;; picks parent B for pixel 32w+k. Pixels are processed 16 at a time: 48 bytes
  ;; = three v128 loads per parent, with the 16 selector bits turned into byte
  ;; masks via swizzle.
  (func (export "crossover") (param $a i32) (param $b i32) (param $t i32)
                             (param $c i32) (param $bits i32) (param $npix i32) (result f64)
    (local $groups i32) (local $i i32) (local $o i32)
    (local $sel v128) (local $x v128) (local $sum v128) (local $acc v128)
    (local $p i32) (local $src i32) (local $end i32) (local $d i32) (local $tail i64)
    (local.set $groups (i32.shr_u (local.get $npix) (i32.const 4)))
    (block $done
      (loop $group
        (br_if $done (i32.ge_u (local.get $i) (local.get $groups)))
        (local.set $o (i32.mul (local.get $i) (i32.const 48)))
        (local.set $sel (i16x8.splat
          (i32.load16_u (i32.add (local.get $bits) (i32.shl (local.get $i) (i32.const 1))))))

        (local.set $x
          (v128.bitselect (v128.load (i32.add (local.get $b) (local.get $o)))
                          (v128.load (i32.add (local.get $a) (local.get $o)))
                          (call $mask (local.get $sel)
                            (v128.const i8x16 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0)
                            (v128.const i8x16 1 1 1 2 2 2 4 4 4 8 8 8 16 16 16 32))))
        (v128.store (i32.add (local.get $c) (local.get $o)) (local.get $x))
        (local.set $sum (call $sqdiff (local.get $x) (v128.load (i32.add (local.get $t) (local.get $o)))))

        (local.set $x
          (v128.bitselect (v128.load offset=16 (i32.add (local.get $b) (local.get $o)))
                          (v128.load offset=16 (i32.add (local.get $a) (local.get $o)))
                          (call $mask (local.get $sel)
                            (v128.const i8x16 0 0 0 0 0 0 0 0 1 1 1 1 1 1 1 1)
                            (v128.const i8x16 32 32 64 64 64 128 128 128 1 1 1 2 2 2 4 4))))
        (v128.store offset=16 (i32.add (local.get $c) (local.get $o)) (local.get $x))
        (local.set $sum (i32x4.add (local.get $sum)
          (call $sqdiff (local.get $x) (v128.load offset=16 (i32.add (local.get $t) (local.get $o))))))

        (local.set $x
          (v128.bitselect (v128.load offset=32 (i32.add (local.get $b) (local.get $o)))
                          (v128.load offset=32 (i32.add (local.get $a) (local.get $o)))
                          (call $mask (local.get $sel)
                            (v128.const i8x16 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1)
                            (v128.const i8x16 4 8 8 8 16 16 16 32 32 32 64 64 64 128 128 128))))
        (v128.store offset=32 (i32.add (local.get $c) (local.get $o)) (local.get $x))
        (local.set $sum (i32x4.add (local.get $sum)
          (call $sqdiff (local.get $x) (v128.load offset=32 (i32.add (local.get $t) (local.get $o))))))

        (local.set $acc (i64x2.add (local.get $acc) (i64x2.extend_low_i32x4_u (local.get $sum))))
        (local.set $acc (i64x2.add (local.get $acc) (i64x2.extend_high_i32x4_u (local.get $sum))))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $group)))

    ;; Leftover pixels (fewer than 16): copy and score one byte at a time.
    (local.set $p (i32.shl (local.get $groups) (i32.const 4)))
    (block $tail_done
      (loop $pixel
        (br_if $tail_done (i32.ge_u (local.get $p) (local.get $npix)))
        (local.set $src
          (select (local.get $b) (local.get $a)
            (i32.and
              (i32.shr_u
                (i32.load (i32.add (local.get $bits) (i32.shl (i32.shr_u (local.get $p) (i32.const 5)) (i32.const 2))))
                (local.get $p))
              (i32.const 1))))
        (local.set $o (i32.mul (local.get $p) (i32.const 3)))
        (local.set $end (i32.add (local.get $o) (i32.const 3)))
        (loop $byte
          (i32.store8 (i32.add (local.get $c) (local.get $o))
            (i32.load8_u (i32.add (local.get $src) (local.get $o))))
          (local.set $d (i32.sub (i32.load8_u (i32.add (local.get $src) (local.get $o)))
                                 (i32.load8_u (i32.add (local.get $t) (local.get $o)))))
          (local.set $tail (i64.add (local.get $tail)
            (i64.extend_i32_u (i32.mul (local.get $d) (local.get $d)))))
          (local.set $o (i32.add (local.get $o) (i32.const 1)))
          (br_if $byte (i32.lt_u (local.get $o) (local.get $end))))
        (local.set $p (i32.add (local.get $p) (i32.const 1)))
        (br $pixel)))

    (f64.convert_i64_u (i64.add
      (i64.add (i64x2.extract_lane 0 (local.get $acc)) (i64x2.extract_lane 1 (local.get $acc)))
      (local.get $tail))))
)
