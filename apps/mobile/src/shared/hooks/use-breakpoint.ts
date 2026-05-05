import { useWindowDimensions } from 'react-native';

/**
 * Breakpoint thresholds (in CSS px / RN dp) — kept in sync with Tailwind so
 * `sm:`, `md:`, `lg:`, `xl:` NativeWind utilities respond at the same widths.
 *
 *   xs : 0       — small phones (iPhone SE 1st gen, Galaxy A01)
 *   sm : >= 480  — standard phones
 *   md : >= 640  — large phones / phablets / small tablet portrait
 *   lg : >= 768  — tablet portrait (iPad mini, 10" tablets)
 *   xl : >= 1024 — tablet landscape / small laptops
 */
export const BREAKPOINTS = {
  xs: 0,
  sm: 480,
  md: 640,
  lg: 768,
  xl: 1024,
} as const;

export type Breakpoint = keyof typeof BREAKPOINTS;

const ORDER: Breakpoint[] = ['xs', 'sm', 'md', 'lg', 'xl'];

function bpFor(width: number): Breakpoint {
  let bp: Breakpoint = 'xs';
  for (const key of ORDER) if (width >= BREAKPOINTS[key]) bp = key;
  return bp;
}

export interface BreakpointState {
  /** Current breakpoint name. */
  bp: Breakpoint;
  width: number;
  height: number;
  /** True for `xs` and `sm` — phone-class device. */
  isPhone: boolean;
  /** True for `md` (large phones) — useful for compact-but-still-stacked layouts. */
  isCompact: boolean;
  /** True for `lg` and up — render side rails / multi-pane layouts. */
  isTablet: boolean;
  /** True for `xl` — render expanded rails with full labels, more chrome. */
  isWide: boolean;
  isLandscape: boolean;
  /** Returns true when the active breakpoint is at least `min`. */
  atLeast: (min: Breakpoint) => boolean;
}

export function useBreakpoint(): BreakpointState {
  const { width, height } = useWindowDimensions();
  const bp = bpFor(width);
  const idx = ORDER.indexOf(bp);
  return {
    bp,
    width,
    height,
    isPhone: idx <= ORDER.indexOf('sm'),
    isCompact: bp === 'md',
    isTablet: idx >= ORDER.indexOf('lg'),
    isWide: idx >= ORDER.indexOf('xl'),
    isLandscape: width > height,
    atLeast: (min) => ORDER.indexOf(bp) >= ORDER.indexOf(min),
  };
}

/**
 * Pick a value for the active breakpoint. Falls back down the chain — if you
 * specify only `lg` and the active bp is `md`, you get the `xs` value (or
 * whatever is the closest defined entry below the active bp).
 *
 * Example: `useResponsiveValue({ xs: 12, lg: 24 })` returns 12 on phones, 24
 * on tablets (md falls through to xs because no md entry was given).
 */
export function useResponsiveValue<T>(values: Partial<Record<Breakpoint, T>>): T | undefined {
  const { bp } = useBreakpoint();
  const idx = ORDER.indexOf(bp);
  for (let i = idx; i >= 0; i--) {
    const key = ORDER[i];
    if (values[key] !== undefined) return values[key];
  }
  return undefined;
}
