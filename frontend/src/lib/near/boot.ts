// Imported first by main.tsx: everything chain-shaped is served by NEAR before any page module runs.
import { Buffer } from 'buffer';
import { installAleoRestShim } from './aleo-rest';

// Some NEAR wallet code (near-api-js and randombytes inside the Meteor SDK) expects Node's global, Buffer and
// process. Without `global` the Meteor module throws while loading and the wallet selector never starts.
const g = globalThis as unknown as {
  global?: unknown;
  Buffer?: typeof Buffer;
  process?: { env: Record<string, string | undefined>; nextTick?: unknown };
};
if (!g.global) g.global = globalThis;
if (!g.Buffer) g.Buffer = Buffer;
if (!g.process) g.process = { env: {}, nextTick: (fn: (...a: unknown[]) => void, ...a: unknown[]) => queueMicrotask(() => fn(...a)) };

installAleoRestShim();
