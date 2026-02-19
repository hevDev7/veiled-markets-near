import { defineConfig } from 'vite'
import { resolve } from 'path'
import react from '@vitejs/plugin-react'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'

export default defineConfig({
  plugins: [react(), wasm(), topLevelAwait()],
  resolve: {
    alias: {
      '@': '/src',
      // Stub out core-js CJS polyfill imported by @provablehq/sdk - not needed in modern browsers
      'core-js/proposals/json-parse-with-source.js': resolve(__dirname, 'src/lib/empty-module.js'),
    },
    // Force all @provablehq packages to share the same instance of React context
    // Without this, -react-ui bundles its own copy of -react, creating duplicate WalletContext
    dedupe: [
      '@provablehq/aleo-wallet-adaptor-react',
      '@provablehq/aleo-wallet-adaptor-core',
      '@provablehq/aleo-types',
      'react',
      'react-dom',
    ],
  },
  worker: {
    format: 'es',
    plugins: () => [wasm(), topLevelAwait()],
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        format: 'es',
      },
    },
  },
  optimizeDeps: {
    exclude: ['@provablehq/wasm', '@provablehq/sdk'],
    // Force Vite to re-optimize deps and bundle wallet packages together
    // so they share the same WalletContext instance
    include: [
      '@provablehq/aleo-wallet-adaptor-react',
      '@provablehq/aleo-wallet-adaptor-react-ui',
      '@provablehq/aleo-wallet-adaptor-react > @provablehq/aleo-wallet-adaptor-core',
    ],
    force: true,
  },
  server: {
    port: 3000,
    host: true,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
      'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self' 'wasm-unsafe-eval'",
        "style-src 'self' 'unsafe-inline' https://api.fontshare.com https://fonts.googleapis.com",
        "font-src 'self' https://cdn.fontshare.com https://fonts.gstatic.com",
        "img-src 'self' data: blob:",
        "connect-src 'self' https://api.explorer.provable.com https://*.supabase.co wss://*.walletconnect.com https://*.walletconnect.com https://api.explorer.aleo.org",
        "worker-src 'self' blob:",
        "frame-src 'none'",
        "object-src 'none'",
        "base-uri 'self'",
      ].join('; '),
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    },
  },
})
