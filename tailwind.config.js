/** @type {import('tailwindcss').Config} */
module.exports = {
  // class names live as full string literals in the HTML and JS template
  // strings, so Tailwind's JIT scanner can extract them directly.
  content: ['./index.html', './js/**/*.js'],
  darkMode: 'class',
  theme: {
    extend: {}
  },
  plugins: []
};
