// A picture for an account, derived from its id alone: a 5 by 5 pattern mirrored left to right, in one hue.
// Nothing is stored or uploaded, so the same account shows the same picture in every browser.

export interface AccountAvatar {
  /** Rows, top to bottom; true is a filled cell. */
  cells: boolean[][]
  /** Hue of the pattern on the colour wheel, 0 to 359. */
  hue: number
}

const SIZE = 5
const HALF = 3 // columns 0..2 are drawn from the hash; 3 and 4 mirror 1 and 0
const MIN_FILLED = 6
const MAX_FILLED = 19

/** Two 32-bit hashes of a string that do not move together (the halves of cyrb53). */
function hashPair(text: string): [number, number] {
  let a = 0xdeadbeef
  let b = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i)
    a = Math.imul(a ^ ch, 2654435761)
    b = Math.imul(b ^ ch, 1597334677)
  }
  a = Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909)
  b = Math.imul(b ^ (b >>> 16), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909)
  return [a >>> 0, b >>> 0]
}

function cellsFrom(bits: number): boolean[][] {
  return Array.from({ length: SIZE }, (_, row) =>
    Array.from({ length: SIZE }, (_, col) => {
      const source = col < HALF ? col : SIZE - 1 - col
      return ((bits >>> (row * HALF + source)) & 1) === 1
    }),
  )
}

export function accountAvatar(accountId: string): AccountAvatar {
  const id = accountId.trim().toLowerCase()
  const [, colour] = hashPair(id)
  // A pattern that is almost empty or almost solid says nothing, so the next hash is tried until one is neither.
  for (let attempt = 0; ; attempt++) {
    const [pattern] = hashPair(attempt === 0 ? id : `${id}#${attempt}`)
    const cells = cellsFrom(pattern)
    const filled = cells.flat().filter(Boolean).length
    if (filled >= MIN_FILLED && filled <= MAX_FILLED) return { cells, hue: colour % 360 }
  }
}
