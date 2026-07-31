/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        saffron: {
          DEFAULT: '#E8832D',
          light: '#F4A460',
          lighter: '#FBD8B0',
          dark: '#D06E1E',
          deeper: '#B85A12',
        },
        maroon: {
          DEFAULT: '#7B2D26',
          light: '#A0524A',
          lighter: '#C47A72',
          dark: '#5C1F1A',
          deeper: '#3D1410',
        },
        gold: {
          DEFAULT: '#C9A84C',
          light: '#E8D5A3',
          lighter: '#F5ECCE',
          dark: '#A8893A',
        },
        cream: {
          DEFAULT: '#FDF8F3',
          darker: '#F5EDE5',
        },
        warm: {
          gray: '#F5F0EB',
          gray2: '#EAE4DE',
          beige: '#EDE6D9',
        },
        tulsi: {
          DEFAULT: '#4A7C59',
          light: '#7BA88A',
          lighter: '#B5D4C0',
          dark: '#2E5A3C',
        },
        turmeric: {
          DEFAULT: '#E8B931',
          light: '#F5D669',
          lighter: '#FAE99E',
        },
        text: {
          DEFAULT: '#2D1B12',
          light: '#5A4036',
          lighter: '#8A6E62',
          warm: '#4A3428',
        },
        shadow: {
          DEFAULT: 'rgba(45, 27, 18, 0.08)',
          medium: 'rgba(45, 27, 18, 0.12)',
          strong: 'rgba(45, 27, 18, 0.18)',
        },
      },
      fontFamily: {
        serif: ['Fraunces', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Fraunces', 'Georgia', 'serif'],
      },
      fontSize: {
        'display': ['3.5rem', { lineHeight: '1.1', letterSpacing: '-0.02em' }],
        'display-sm': ['2.75rem', { lineHeight: '1.2', letterSpacing: '-0.02em' }],
        'heading': ['2rem', { lineHeight: '1.2', letterSpacing: '-0.01em' }],
        'heading-sm': ['1.5rem', { lineHeight: '1.3' }],
        'body': ['1rem', { lineHeight: '1.6' }],
        'body-sm': ['0.9rem', { lineHeight: '1.5' }],
        'caption': ['0.8rem', { lineHeight: '1.4' }],
      },
      borderRadius: {
        'organic': '1.25rem',
        'organic-sm': '0.75rem',
        'organic-lg': '1.75rem',
        'pill': '9999px',
      },
      boxShadow: {
        'warm': '0 4px 20px rgba(45, 27, 18, 0.06)',
        'warm-md': '0 8px 32px rgba(45, 27, 18, 0.08)',
        'warm-lg': '0 12px 48px rgba(45, 27, 18, 0.10)',
        'warm-xl': '0 20px 64px rgba(45, 27, 18, 0.12)',
        'inner-warm': 'inset 0 2px 4px rgba(45, 27, 18, 0.04)',
      },
      backgroundImage: {
        'grain': "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.3'/%3E%3C/svg%3E\")",
        'warm-gradient': 'linear-gradient(135deg, #FDF8F3 0%, #F5EDE5 100%)',
        'saffron-glow': 'radial-gradient(ellipse at 50% 50%, rgba(232, 131, 45, 0.08) 0%, transparent 70%)',
        'maroon-glow': 'radial-gradient(ellipse at 50% 50%, rgba(123, 45, 38, 0.05) 0%, transparent 70%)',
      },
      keyframes: {
        'float': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(24px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'breathe': {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.02)' },
        },
        'drift': {
          '0%': { transform: 'translate(0px, 0px) rotate(0deg)' },
          '33%': { transform: 'translate(5px, -5px) rotate(2deg)' },
          '66%': { transform: 'translate(-3px, 3px) rotate(-1deg)' },
          '100%': { transform: 'translate(0px, 0px) rotate(0deg)' },
        },
      },
      animation: {
        'float': 'float 6s ease-in-out infinite',
        'pulse-soft': 'pulse-soft 3s ease-in-out infinite',
        'fade-in': 'fade-in 0.6s ease-out',
        'slide-up': 'slide-up 0.8s ease-out',
        'breathe': 'breathe 4s ease-in-out infinite',
        'drift': 'drift 12s ease-in-out infinite',
      },
    },
  },
  plugins: [
    require('tailwindcss-animate'),
  ],
}
