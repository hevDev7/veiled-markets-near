// Imported first by main.tsx: everything chain-shaped is served by NEAR before any page module runs.
import { Buffer } from 'buffer';
import { installAleoRestShim } from './aleo-rest';

// Node's global, Buffer and process, which the Meteor module of the old NEAR Wallet Selector needed on this page.
// NEAR Connect runs each wallet's code in its own sandboxed iframe, so these are likely unused now; they stay until
// the whole app has been checked without them.
const g = globalThis as unknown as {
  global?: unknown;
  Buffer?: typeof Buffer;
  process?: { env: Record<string, string | undefined>; nextTick?: unknown };
};
if (!g.global) g.global = globalThis;
if (!g.Buffer) g.Buffer = Buffer;
if (!g.process) g.process = { env: {}, nextTick: (fn: (...a: unknown[]) => void, ...a: unknown[]) => queueMicrotask(() => fn(...a)) };

installAleoRestShim();
