/**
 * Reveal sequence (spec §16.5), at most 1200 ms in total:
 *  1. numbers roll digit by digit, top to bottom, staggered 40 ms per row
 *  2. leaderboard rows swap positions in one 300 ms move
 *  3. if trust falls by 5 or more, the trust numerals invert once for 400 ms
 *
 * The DOM already holds the final values. The sequence temporarily shows the
 * previous values (data-prev) and previous row order (data-prev-index).
 * Reduced motion: nothing is animated.
 */

export const REVEAL = {
  staggerMs: 40,
  rollMs: 360,
  swapMs: 300,
  invertMs: 400,
  totalMaxMs: 1200,
  invertThreshold: -5,
} as const;

export interface RevealPlan {
  rollStart: number[];
  rollEnd: number;
  swapStart: number;
  swapEnd: number;
  invertStart: number | null;
  invertEnd: number | null;
  total: number;
}

export function planReveal(rows: number, trustDelta: number): RevealPlan {
  const rollStart = Array.from({ length: rows }, (_, i) => i * REVEAL.staggerMs);
  const rollEnd = (rows > 0 ? (rows - 1) * REVEAL.staggerMs : 0) + REVEAL.rollMs;
  const swapStart = rollEnd;
  const swapEnd = swapStart + REVEAL.swapMs;
  const inverts = trustDelta <= REVEAL.invertThreshold;
  const invertEnd = inverts ? REVEAL.totalMaxMs : null;
  const invertStart = inverts ? REVEAL.totalMaxMs - REVEAL.invertMs : null;
  return { rollStart, rollEnd, swapStart, swapEnd, invertStart, invertEnd, total: Math.max(swapEnd, invertEnd ?? 0) };
}

/**
 * One frame of the character flip. Characters settle left to right; a digit that
 * has not settled shows a cycling digit. Non-digits show their final value.
 * progress is in [0, 1]; frame is a free-running counter.
 */
export function rollText(prev: string, final: string, progress: number, frame: number): string {
  if (progress >= 1) return final;
  const n = Math.max(prev.length, final.length);
  const p = prev.padStart(n, ' ');
  const f = final.padStart(n, ' ');
  const isDigit = (c: string) => c >= '0' && c <= '9';
  let out = '';
  for (let k = 0; k < n; k++) {
    const fc = f.charAt(k);
    const pc = p.charAt(k);
    const settled = progress >= (k + 1) / (n + 1);
    out += settled || !isDigit(fc) ? fc : String(((isDigit(pc) ? Number(pc) : 0) + frame + k) % 10);
  }
  return out.slice(n - final.length);
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

interface Running {
  cancel: () => void;
  done: Promise<void>;
}

/** Play the reveal inside root. Resolves when finished; cancel() restores final values. */
export function playReveal(root: HTMLElement): Running {
  const noop: Running = { cancel: () => {}, done: Promise.resolve() };
  if (prefersReducedMotion()) return noop;

  const rollEls = Array.from(root.querySelectorAll<HTMLElement>('[data-roll]'));
  const rows = Array.from(root.querySelectorAll<HTMLElement>('[data-row-key]'));
  const trustEl = root.querySelector<HTMLElement>('[data-trust-numerals]');
  const trustDelta = Number(trustEl?.dataset.trustDelta ?? '0');
  const plan = planReveal(rows.length, trustDelta);

  const finals = rollEls.map((el) => el.textContent ?? '');
  const rowIndexOf = (el: HTMLElement): number => {
    const tr = el.closest<HTMLElement>('[data-row-key]');
    return tr ? Math.max(0, rows.indexOf(tr)) : 0;
  };

  let cancelled = false;
  let raf = 0;
  const animations: Animation[] = [];
  let resolveDone: () => void = () => {};
  const done = new Promise<void>((r) => (resolveDone = r));
  const t0 = performance.now();

  const rowHeight =
    rows.length > 1 ? (rows[1]?.getBoundingClientRect().top ?? 0) - (rows[0]?.getBoundingClientRect().top ?? 0) : 0;

  const restore = () => {
    rollEls.forEach((el, i) => (el.textContent = finals[i] ?? ''));
    trustEl?.classList.remove('is-inverted');
  };

  const swapStarted = { value: false };
  const startSwap = () => {
    swapStarted.value = true;
    rows.forEach((tr) => {
      const prevIdx = Number(tr.dataset.prevIndex ?? '');
      const idx = rows.indexOf(tr);
      if (Number.isNaN(prevIdx) || prevIdx === idx || rowHeight === 0) return;
      const offset = (prevIdx - idx) * rowHeight;
      animations.push(
        tr.animate([{ transform: `translateY(${offset}px)` }, { transform: 'translateY(0)' }], {
          duration: REVEAL.swapMs,
          easing: 'steps(6, jump-end)',
        }),
      );
    });
  };

  // Hold rows at their previous positions until the swap begins.
  const hold = rows
    .map((tr) => {
      const prevIdx = Number(tr.dataset.prevIndex ?? '');
      const idx = rows.indexOf(tr);
      if (Number.isNaN(prevIdx) || prevIdx === idx || rowHeight === 0) return null;
      tr.style.transform = `translateY(${(prevIdx - idx) * rowHeight}px)`;
      return tr;
    })
    .filter((tr): tr is HTMLElement => tr !== null);

  const tick = (now: number) => {
    if (cancelled) return;
    const t = now - t0;
    const frame = Math.floor(t / 30);
    rollEls.forEach((el, i) => {
      const start = plan.rollStart[rowIndexOf(el)] ?? 0;
      const progress = Math.min(1, Math.max(0, (t - start) / REVEAL.rollMs));
      const prev = el.dataset.prev ?? finals[i] ?? '';
      el.textContent = rollText(prev, finals[i] ?? '', progress, frame);
    });
    if (!swapStarted.value && t >= plan.swapStart) {
      hold.forEach((tr) => (tr.style.transform = ''));
      startSwap();
    }
    if (plan.invertStart !== null && plan.invertEnd !== null && trustEl) {
      trustEl.classList.toggle('is-inverted', t >= plan.invertStart && t < plan.invertEnd);
    }
    if (t >= plan.total) {
      restore();
      resolveDone();
      return;
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return {
    done,
    cancel: () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      animations.forEach((a) => a.cancel());
      hold.forEach((tr) => (tr.style.transform = ''));
      restore();
      resolveDone();
    },
  };
}
