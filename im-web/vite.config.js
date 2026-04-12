import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import htmlMinifier from 'vite-plugin-html-minifier'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig(({ command, mode }) => {
  const isProduction = mode === 'production'

  return {
    plugins: [
      vue(),
      htmlMinifier({
        minify: isProduction,
      }),
    ],

    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },

    server: {
      port: 8080,
    },

    build: {
      outDir: 'dist',
      sourcemap: false,
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: true,
          drop_debugger: true
        },
        mangle: {
          toplevel: false,
          properties: false,
        },
        format: {
          comments: false,
        },
      },
      rollupOptions: {
        output: {
          entryFileNames: `assets/scr-[hash].js`,
          chunkFileNames: `assets/scr-[hash].js`,
          assetFileNames: `assets/scr-[hash].[ext]`,
        },
      },
    },
  }
})