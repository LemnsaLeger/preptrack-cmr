// Tokens taken directly from the exported Stitch DESIGN.md / code.html
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#004ac6',
        'primary-container': '#2563eb',
        'on-primary': '#ffffff',
        secondary: '#565e74',
        'secondary-container': '#dae2fd',
        'on-secondary-fixed-variant': '#3f465c',
        surface: '#f7f9fb',
        'surface-container-lowest': '#ffffff',
        'surface-container-low': '#f2f4f6',
        'surface-container': '#eceef0',
        'surface-container-high': '#e6e8ea',
        'on-surface': '#191c1e',
        'on-surface-variant': '#434655',
        outline: '#737686',
        'outline-variant': '#c3c6d7',
        error: '#ba1a1a',
        'error-container': '#ffdad6',
        urgent: '#DC2626',
        upcoming: '#D97706',
        success: '#059669',
        line: '#E2E8F0',
      },
      borderRadius: { DEFAULT: '0.25rem', lg: '0.5rem', xl: '0.75rem', '2xl': '1rem', full: '9999px' },
      fontFamily: { sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'] },
      fontSize: {
        'label-sm': ['11px', { lineHeight: '14px', letterSpacing: '0.04em', fontWeight: '700' }],
        'label-md': ['13px', { lineHeight: '16px', letterSpacing: '0.02em', fontWeight: '600' }],
        'body-sm': ['12px', { lineHeight: '16px', letterSpacing: '0.01em' }],
        'body-md': ['14px', { lineHeight: '20px' }],
        'body-lg': ['16px', { lineHeight: '24px' }],
        'headline-sm': ['18px', { lineHeight: '24px', letterSpacing: '-0.005em', fontWeight: '600' }],
        'headline-lg': ['22px', { lineHeight: '28px', letterSpacing: '-0.01em', fontWeight: '600' }],
        'headline-xl': ['30px', { lineHeight: '36px', letterSpacing: '-0.02em', fontWeight: '700' }],
      },
      boxShadow: {
        lift: '0 2px 4px -1px rgba(15,23,42,0.06), 0 1px 2px -1px rgba(15,23,42,0.04)',
        modal: '0 8px 16px -4px rgba(15,23,42,0.12)',
      },
    },
  },
  plugins: [],
};
