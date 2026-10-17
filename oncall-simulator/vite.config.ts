import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import { fileURLToPath } from 'node:url';

const ENGINE_PORT = Number(process.env.PORT ?? 4100);

export default defineConfig({
  root: 'web',
  plugins: [react()],
  css: { postcss: { plugins: [tailwindcss({ config: fileURLToPath(new URL('./tailwind.config.js', import.meta.url)) }), autoprefixer()] } },
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 1500 },
  server: {
    port: 5173,
    proxy: { '/api': `http://localhost:${ENGINE_PORT}` },
  },
});
