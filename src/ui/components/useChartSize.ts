import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

export interface ChartSize {
  /** Container width and height in CSS pixels; the SVG's user units. */
  w: number;
  h: number;
  /** Computed font size of the container in pixels. */
  fs: number;
}

/** Used before the first measurement and when rendering without a DOM (tests, server). */
export const DEFAULT_CHART_SIZE: ChartSize = { w: 640, h: 320, fs: 16 };

/** Measures an element with a ResizeObserver so a chart's SVG is laid out in real pixels at any container size. */
export function useChartSize<T extends HTMLElement>(opts: { inner?: boolean } = {}): [RefObject<T | null>, ChartSize] {
  const inner = opts.inner === true;
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState<ChartSize>(DEFAULT_CHART_SIZE);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const fs = parseFloat(getComputedStyle(el).fontSize) || DEFAULT_CHART_SIZE.fs;
      // `inner`: the content area inside any scrollbar, for a chart that scrolls within its container.
      const w = inner ? el.clientWidth : r.width;
      const h = inner ? el.clientHeight : r.height;
      const next = { w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)), fs };
      setSize((s) => (s.w === next.w && s.h === next.h && s.fs === next.fs ? s : next));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [inner]);
  return [ref, size];
}

/** Advance width of one IBM Plex Mono character as a share of the font size (600/1000 em). */
export const CH = 0.6;

/** A sanitised, document-unique id for SVG pattern references from React's `useId` value. */
export const svgId = (reactId: string, suffix: string): string => `c${reactId.replace(/[^A-Za-z0-9]/g, '')}-${suffix}`;
