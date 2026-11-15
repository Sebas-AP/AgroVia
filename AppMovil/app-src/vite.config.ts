import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Built output is copied into the Android WebView's assets/www/, served from
// https://appassets.androidplatform.net/assets/www/ — relative asset paths work there.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
})
