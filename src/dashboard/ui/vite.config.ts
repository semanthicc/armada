import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { resolve } from 'path'

export default defineConfig({
  plugins: [svelte()],
  root: 'src/dashboard/ui',
  base: './', // Relative paths for assets
  build: {
    outDir: '../static',
    emptyOutDir: true,
  }
})