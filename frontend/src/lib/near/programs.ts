// The Aleo program ids the pages pass around, and what each one stands for on NEAR. Aleo kept one market program
// per token, a turbo program, two stablecoin programs and credits.aleo; on NEAR they are all the Veiled contract
// (and the NEP-141 token contracts for public stablecoin balances).
import { config } from '../config';
import { TOKEN } from './config';

const env = import.meta.env as Record<string, string | undefined>;
export const TURBO_PROGRAM = env.VITE_TURBO_PROGRAM_ID || 'veiled_turbo_v9.aleo';

export const isTurboProgram = (program: string) => program === TURBO_PROGRAM || /^veiled_turbo/.test(program);

/** Market program → the token its markets trade in, or null for any other program. */
export function marketProgramToken(program: string): number | null {
  if (program === config.programId) return TOKEN.NEAR;
  if (program === config.usdcxMarketProgramId) return TOKEN.USDCX;
  if (program === config.usadProgramId) return TOKEN.USAD;
  if (!program.startsWith('veiled_markets')) return null;
  if (program.includes('usdcx')) return TOKEN.USDCX;
  if (program.includes('usad')) return TOKEN.USAD;
  return TOKEN.NEAR;
}

/** credits.aleo and the stablecoin programs → the token whose balance they hold. */
export function balanceProgramToken(program: string): number | null {
  if (program === 'credits.aleo') return TOKEN.NEAR;
  if (program === config.usdcxProgramId || /usdcx_stablecoin/.test(program)) return TOKEN.USDCX;
  if (/usad_stablecoin/.test(program)) return TOKEN.USAD;
  return null;
}

/** The UI's token names ('NEAR' is the native token; it was 'ALEO' on Aleo). */
export const tokenOfType = (t: 'NEAR' | 'USDCX' | 'USAD' | string | undefined): number =>
  t === 'USDCX' ? TOKEN.USDCX : t === 'USAD' ? TOKEN.USAD : TOKEN.NEAR;
