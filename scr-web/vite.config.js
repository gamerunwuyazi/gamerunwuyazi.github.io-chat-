import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { createHtmlPlugin } from 'vite-plugin-html'
import viteCompression from 'vite-plugin-compression'

export default defineConfig(({ mode }) => {
  const isProduction = mode === 'production'

  return {
    plugins: [
      vue(),
      createHtmlPlugin({
        minify: isProduction ? {
          collapseWhitespace: true,
          keepClosingSlash: true,
          removeComments: true,
          removeRedundantAttributes: true,
          removeScriptTypeAttributes: true,
          removeStyleLinkTypeAttributes: true,
          useShortDoctype: true,
          minifyCSS: true,
          minifyJS: true,
        } : false,
      }),
      isProduction && viteCompression({
        algorithm: 'gzip',
        ext: '.gz',
        threshold: 10240,
        deleteOriginFile: false,
      }),
      isProduction && viteCompression({
        algorithm: 'brotliCompress',
        ext: '.br',
        threshold: 10240,
        deleteOriginFile: false,
      }),
    ].filter(Boolean),

    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },

    server: {
      port: 8080,
    },

    preview: {
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
          toplevel: true,
          properties: false,
        },
        format: {
          comments: false,
        },
      },
      rolldownOptions: {
        output: {
          entryFileNames: `assets/scr-[hash].js`,
          chunkFileNames: `assets/scr-[hash].js`,
          assetFileNames: `assets/scr-[hash].[ext]`,
          codeSplitting: {
            groups: [
              {
                name: 'vue-vendor',
                test: /[\\/]node_modules[\\/](vue|vue-router|pinia)[\\/]/,
                priority: 20,
              },
              {
                name: 'chat-vendor',
                test: /[\\/]node_modules[\\/](socket\.io-client|localforage|marked|dompurify)[\\/]/,
                priority: 10,
              },
            ],
          },
        },
      },
      chunkSizeWarningLimit: 1500,
    },
  }
})