const preset = require('../../libs/ui/tailwind.preset.cjs');

/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [preset],
  content: [
    // Next.js app router + any legacy roots.
    './{src,pages,components,app}/**/*.{ts,tsx,js,jsx,html}',
    // Real UI lives here — feature modules and shared layout/forms.
    './features/**/*.{ts,tsx,js,jsx,html}',
    './shared/**/*.{ts,tsx,js,jsx,html}',
    '!./**/*.{stories,spec}.{ts,tsx,js,jsx,html}',
    // Pull in shared shadcn-style components from the workspace lib.
    '../../libs/ui/src/**/*.{ts,tsx,js,jsx,html}',
  ],
  // Force-include layout-critical classes. Next 16's Turbopack production
  // build occasionally drops responsive variants and arbitrary values from
  // feature/shared folders even with the right content globs (verified
  // empirically: standalone `tailwindcss` CLI emits them, `next build` does
  // not). Until we migrate to Tailwind v4 + @tailwindcss/postcss, force a
  // pattern-based safelist for the breakpoint variants we use in the shell.
  safelist: [
    'min-h-screen', 'h-screen', 'w-60', 'w-72', 'shrink-0',
    'max-w-[85vw]',
    {
      pattern:
        /^(sm|md|lg|xl|2xl):(flex|inline-flex|hidden|block|grid|flex-row|flex-col|items-center|items-start|items-end|items-baseline|justify-between|justify-center|justify-end|justify-start)$/,
    },
    {
      pattern: /^(sm|md|lg|xl|2xl):(grid-cols-[1-6]|col-span-[1-3])$/,
    },
    {
      pattern: /^(sm|md|lg|xl|2xl):(gap-[1-9]|px-[1-9]|py-[1-9]|p-[1-9])$/,
    },
    {
      pattern: /^(sm|md|lg|xl|2xl):(w-(?:[0-9]+|full|auto)|max-w-(?:sm|md|lg|xl|2xl|full|none))$/,
    },
  ],
};
