// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
// vite.config.js
import { defineConfig } from 'vite';
import vituum from 'vituum';
import handlebars from '@vituum/vite-plugin-handlebars';


export default defineConfig({
  plugins: [
    vituum(),
    handlebars({
      partials: {
        directory: './src/components',
        extname: false
      },
    }),
  ],
  optimizeDeps: {
    include: [
      'monaco-editor', 
      '@monaco-editor/loader',
      // Add these to prevent "New dependencies found" reloads:
      'monaco-editor/esm/vs/language/json/json.worker',
      'monaco-editor/esm/vs/language/css/css.worker',
      'monaco-editor/esm/vs/language/html/html.worker',
      'monaco-editor/esm/vs/language/typescript/ts.worker',
      'monaco-editor/esm/vs/editor/editor.worker'
    ]
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          monaco: ['monaco-editor']
        }
      }
    }
  },
  server: {
    host: true, 
    port: 4174,  
    warmup: {
      // Only touch actual JS entrypoints plus the shared main stylesheet to avoid
      // compiling standalone Handlebars/SCSS partials (those caused the earlier errors).
      clientFiles: [
        './src/assets/**/*.js',
        './src/assets/**/*.ts',
        './src/assets/scss/main.scss'
      ]
    }
  }
});
