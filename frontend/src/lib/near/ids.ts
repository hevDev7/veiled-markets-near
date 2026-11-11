// The UI keeps the Aleo id spelling for markets ("12field"); the contract takes plain u64 strings ("12").

/** "12field" | "12" | 12 | 12n → "12". Throws on anything that is not a plain id. */
export function nearId(id: string | number | bigint): string {
  const s = String(id).trim().replace(/\.(private|public)$/, '').replace(/field$/, '');
  if (!/^\d+$/.test(s)) throw new Error(`Not a market id: ${String(id)}`);
  return s.replace(/^0+(?=\d)/, '');
}

/** 12 | "12" | "12field" → "12field". */
export function aleoId(id: string | number | bigint): string {
  return `${nearId(id)}field`;
}

/** Strips a Leo literal suffix and visibility: "5u128.private" → "5". */
export function leoValue(v: string): string {
  return String(v)
    .trim()
    .replace(/\.(private|public|constant)$/, '')
    .replace(/(u8|u16|u32|u64|u128|i8|i16|i32|i64|i128|field|group|scalar)$/, '');
}

export const leoBig = (v: string): bigint => BigInt(leoValue(v));
export const leoNum = (v: string): number => Number(leoValue(v));
