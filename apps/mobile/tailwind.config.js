const { hairlineWidth } = require('nativewind/theme');
const preset = require('../../libs/ui/tailwind.preset.cjs');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,jsx,ts,tsx}',
    '../../libs/ui/src/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset'), preset],
  theme: {
    extend: {
      borderWidth: { hairline: hairlineWidth() },
    },
  },
};
