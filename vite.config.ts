import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  // Set base for GitHub Pages project site: https://<user>.github.io/arithmatrix/
  // If deploying to a custom domain or org root, adjust accordingly.
  base: '/arithmatrix/',
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
        secure: false,
      },
    },
    host: true,
  },
});
