import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const API_PORT = Number.parseInt(process.env.API_PORT ?? '3000', 10);

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: `http://localhost:${API_PORT}`,
        changeOrigin: false,
      },
    },
  },
});
