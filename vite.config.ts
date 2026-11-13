import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/ssg-clip-maker/',
  plugins: [react()],
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: { manualChunks: { react: ['react', 'react-dom'], media: ['mediabunny'] } },
    },
  },
});
