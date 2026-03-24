/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif']
      },
      colors: {
        brand: {
          blue: '#2563eb',
          purple: '#7c3aed'
        },
        status: {
          present: '#16a34a',
          absent: '#dc2626',
          late: '#f59e0b',
          onleave: '#2563eb'
        },
        threat: {
          low: '#ca8a04',
            medium: '#f97316',
          high: '#dc2626',
          critical: '#991b1b'
        }
      },
      boxShadow: {
        'elevated': '0 4px 16px -2px rgba(0,0,0,0.15)',
        'focus-ring': '0 0 0 3px rgba(59,130,246,0.45)'
      },
      keyframes: {
        'pulse-soft': {
          '0%,100%': { opacity: 1 },
          '50%': { opacity: .55 }
        },
        'scan-bar': {
          '0%': { transform: 'translateY(0%)' },
          '100%': { transform: 'translateY(100%)' }
        }
      },
      animation: {
        'pulse-soft': 'pulse-soft 2.2s ease-in-out infinite',
        'scan-bar': 'scan-bar 1.8s linear infinite'
      }
    }
  },
  plugins: [],
  safelist: [
    // Light backgrounds
    'bg-green-100','bg-red-100','bg-yellow-100','bg-blue-100',
    // Dark mode translucent backgrounds (threat/status badges)
    'dark:bg-green-900/20','dark:bg-red-900/20','dark:bg-yellow-900/20','dark:bg-blue-900/20'
  ]
};
