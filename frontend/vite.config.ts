import { defineConfig, searchForWorkspaceRoot } from 'vite'
import { realpathSync } from 'fs'
import { resolve } from 'path'
import react from '@vitejs/plugin-react'

// The pages import the Aleo wallet packages by name; on NEAR those names resolve to small stand-ins backed by the
// NEAR Wallet Selector (src/lib/near/compat). Keep in sync with "paths" in tsconfig.json.
const compat = (file: string) => resolve(__dirname, 'src/lib/near/compat', file)
const ALEO_PACKAGES: Record<string, string> = {
  '@provablehq/aleo-wallet-adaptor-react-ui': compat('wallet-react-ui.tsx'),
  '@provablehq/aleo-wallet-adaptor-react': compat('wallet-react.tsx'),
  '@provablehq/aleo-wallet-adaptor-core': compat('wallet-core.ts'),
  '@provablehq/aleo-wallet-adaptor-shield': compat('wallet-adapters.ts'),
  '@provablehq/aleo-wallet-adaptor-leo': compat('wallet-adapters.ts'),
  '@provablehq/aleo-wallet-adaptor-fox': compat('wallet-adapters.ts'),
  '@provablehq/aleo-wallet-adaptor-soter': compat('wallet-adapters.ts'),
  '@provablehq/aleo-types': compat('aleo-types.ts'),
  '@provablehq/sdk': compat('provable-sdk.ts'),
  '@puzzlehq/sdk': compat('puzzle-sdk.ts'),
}

// node_modules may be a symlink to a build cache on another disk; let the dev server read from there.
const nodeModules = (() => {
  try {
    return realpathSync(resolve(__dirname, 'node_modules'))
  } catch {
    return resolve(__dirname, 'node_modules')
  }
})()

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: '@', replacement: '/src' },
      // NEAR wallet SDKs require('buffer'): use the npm polyfill instead of Vite's empty browser stub.
      { find: /^buffer$/, replacement: 'buffer/' },
      { find: '@sdk', replacement: resolve(__dirname, '../sdk/src') },
      ...Object.entries(ALEO_PACKAGES).map(([find, replacement]) => ({
        find: new RegExp(`^${find.replace(/[/.]/g, '\\$&')}$`),
        replacement,
      })),
    ],
    dedupe: ['react', 'react-dom'],
  },
  worker: {
    format: 'es',
  },
  // Pre-bundle the packages the app only imports lazily (the prover worker, the wallet modules). Otherwise the dev
  // server discovers them mid-session and reloads the page, which aborts a trade that is being proven.
  optimizeDeps: {
    include: [
      'snarkjs',
      'poseidon-lite',
      '@near-js/transactions',
      '@near-wallet-selector/core',
      '@near-wallet-selector/modal-ui',
      '@near-wallet-selector/meteor-wallet',
      '@near-wallet-selector/my-near-wallet',
    ],
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        format: 'es',
      },
    },
  },
  server: {
    // Not 3000: the Aleo app runs there, and a shared origin would share its localStorage (bets, market ids).
    port: 3100,
    host: true,
    fs: {
      allow: [searchForWorkspaceRoot(process.cwd()), nodeModules, resolve(__dirname, '../near')],
    },
    // No COOP/COEP: wallet popups (Meteor, MyNearWallet) need window.opener, and the Groth16 prover does not
    // need SharedArrayBuffer.
  },
})
