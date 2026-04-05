# Governance Testing

Veiled Markets now has five governance test modes so the team can separate fast logic checks from full package bring-up.

## Commands

### 1. Fast offline logic suite

```bash
pnpm test:governance:logic
```

Use this for quick verification during development. It runs from [contracts-governance-logic](../contracts-governance-logic) with a temporary Leo home and no external program dependencies.

Coverage:
- proposal creation quorum selection
- voting quorum and pass/reject rules
- standard vs long vs emergency timelocks
- execution routing for parameter, pause, resolver, and treasury flows
- lifecycle scenario coverage for create -> finalize -> execute semantics

### 2. Full governance package tests with patched temp registry

```bash
pnpm test:governance
```

This is the closest thing to a full package run for `contracts-governance`. The runner:
- copies `~/.aleo/registry` into a cached home under `/tmp`
- normalizes registry constructors in that cached copy
- reuses `~/.aleo/resources`
- runs `leo test --offline` against the cached home

Use this when you want the real `contracts-governance` package, local market imports, and package test files to compile and boot together without mutating the global Leo registry. This mode reuses the patched registry cache between runs.

If the machine is slow, extend the timeout:

```bash
LEO_TEST_TIMEOUT=180 pnpm test:governance
```

### 3. Cold full-package run

```bash
pnpm test:governance:cold
```

This forces the cached patched home to be rebuilt from scratch before the full package test runs. Use it when:
- the global Leo registry changed
- you want to sanity-check the full cold-start path
- the cached patched home looks suspicious

### 4. Smoke mode

```bash
pnpm test:governance:smoke
```

Smoke mode is the recommended quick check for the full governance area. It runs:
- the standalone governance logic suite
- `leo build` for the real `contracts-governance` package

This is intentionally faster and more deterministic than a full package ledger bring-up.

### 5. Raw global-registry diagnostic mode

```bash
pnpm test:governance:global
```

This mode is only for debugging the user's actual `~/.aleo` registry state. It does not patch constructors or isolate dependencies.

## Why the patched mode exists

Several testnet registry dependencies used by governance flows were published with constructors or deployment expectations that do not replay cleanly on a fresh local ledger. Examples include:
- constructor-less programs like `merkle_tree.aleo` and `token_registry.aleo`
- programs whose constructors assert specific deployment owners or existing multisig state

That makes raw `leo test --offline` unreliable for local package tests even when the contract code itself is fine.

The patched cached-registry runner is intentionally local-only:
- it does not modify `~/.aleo/registry`
- it only rewrites the cached registry copy under `/tmp`
- it is meant for reproducible local tests, not for deployment

## Important limitation

In this environment, Leo does not appear to persist a reusable `storage/ledger-*` under the cached HOME during test runs. In practice that means:
- caching helps avoid registry copy/patch work
- the expensive part is still snarkVM ledger speculation and local deployment replay
- full package runs can remain much slower than smoke or logic modes

## Current recommendation

- Use `pnpm test:governance:logic` for fast iteration and CI-friendly coverage.
- Use `pnpm test:governance:smoke` for the quickest full-governance developer check.
- Use `pnpm test:governance` when you want the real governance package brought up with local imports and are okay with a heavier run.
- Use `pnpm test:governance:cold` only when you want a clean rebuild of the patched cache.
- Use `pnpm test:governance:global` only when diagnosing the user's Leo installation.
