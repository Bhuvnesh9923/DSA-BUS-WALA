const config = {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#FF6B2C',   /* 500 — primary orange */
          light:   '#FF9A6C',   /* 300 — soft peach tint */
          hover:   '#E8571A',   /* 600 — hover state */
          active:  '#C2410C',   /* 700 — pressed / dark active */
          subtle:  'rgba(255, 107, 44, 0.10)', /* icon bg, soft pill */
          bloom:   'rgba(255, 107, 44, 0.20)', /* hovered icon bg */
          glow:    'rgba(255, 107, 44, 0.35)', /* box-shadow glow */
        }
      }
    }
  },
  plugins: []
};

export default config;

