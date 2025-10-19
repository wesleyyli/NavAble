/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      keyframes: {
        fadeIn: {
          '0%': { opacity: 0, transform: 'translateY(20px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        fadeOut: {
          '0%': { opacity: 1, },
          '100%': { opacity: 0.1,  },
        },
        slideIn: {
          '0%': { opacity: 0, transform: 'translateX(20%) translateY(-45px)' },
          '30%': { opacity: 0, transform: 'translateX(20%) translateY(-45px)'},
          '100%': { opacity: 1, transform: 'translateX(0) translateY(-45px)'},
        },
        slideUp: {
          '0%': { opacity: 0, transform: 'translateY(30px)' },
          '60%': { opacity: 0, transform: 'translateY(30px)' },
          '100%': { opacity: 1, transform: 'translateY(-50px)' },
        },
      },
      animation: {
        fadeIn: 'fadeIn 1s ease-out forwards',
        fadeOut: 'fadeOut 0.6s ease-out forwards',
        slideIn: 'slideIn 2s ease-out forwards',
        slideUp: 'slideUp 3s ease-out forwards',
      },
    },
  },
  plugins: [],
}