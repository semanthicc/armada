import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { resolve } from 'path'

export default defineConfig({
  plugins: [svelte()],
  base: './', // Relative paths for assets
  server: {
    proxy: {
      '/api': 'http://localhost:4567'
    }
  },
  build: {
    outDir: '../static',
    emptyOutDir: true,
  }
})