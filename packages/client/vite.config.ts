import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // In dev, the game server runs separately on :3001 (npm run dev:server).
    proxy: { '/socket.io': { target: 'http://localhost:3001', ws: true } },
  },
});
