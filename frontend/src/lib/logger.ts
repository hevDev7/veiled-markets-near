/**
 * Production-safe logger.
 * In development (import.meta.env.DEV), logs everything normally.
 * In production, all output is silenced to prevent leaking sensitive data
 * (transaction IDs, market IDs, amounts, record plaintexts, addresses).
 */

const isDev = import.meta.env.DEV

export const devLog = isDev
  ? console.log.bind(console)
  : (..._args: unknown[]) => {}

export const devWarn = isDev
  ? console.warn.bind(console)
  : (..._args: unknown[]) => {}

export const devError = isDev
  ? console.error.bind(console)
  : (..._args: unknown[]) => {}
