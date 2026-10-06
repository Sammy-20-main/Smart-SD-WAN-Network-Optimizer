import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The analytics engine lives in ../backend and is plain ES modules, so the
// browser can import it directly when the API server is not running.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3000,
    fs: { allow: ['..'] },
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
      },
    },
  },
});
