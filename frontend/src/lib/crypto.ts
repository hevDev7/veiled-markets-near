// ============================================================================
// ENCRYPTION MODULE
// ============================================================================
// AES-256-GCM encryption for Supabase bet data privacy.
// Derives a deterministic encryption key from the wallet's signature
// over a fixed message. Same wallet on any device = same key.
// ============================================================================

const ENCRYPTION_PREFIX = 'enc:v1:'
const IV_LENGTH = 12 // 96 bits for AES-GCM

/** Fixed message signed by wallet to derive encryption key */
export const ENCRYPTION_SIGN_MESSAGE = 'veiled-markets-encryption-v1'

/** sessionStorage key for caching the signature (avoids popup on page refresh) */
export const SIG_CACHE_KEY = 'vm_enc_sig'

/**
 * Derive an AES-256-GCM CryptoKey from a wallet signature string.
 * Returns null if the signature is non-deterministic (Puzzle stub) or invalid.
 */
export async function deriveEncryptionKey(signature: string): Promise<CryptoKey | null> {
  if (!signature || typeof signature !== 'string') return null

  // Puzzle wallet returns non-deterministic stubs
  if (signature.startsWith('puzzle_sig_')) return null

  try {
    const encoder = new TextEncoder()
    const sigBytes = encoder.encode(signature)

    // SHA-256 produces exactly 32 bytes = 256-bit AES key
    const hashBuffer = await crypto.subtle.digest('SHA-256', sigBytes)

    const key = await crypto.subtle.importKey(
      'raw',
      hashBuffer,
      { name: 'AES-GCM' },
      false, // non-extractable
      ['encrypt', 'decrypt']
    )

    return key
  } catch {
    return null
  }
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns "enc:v1:<base64(IV + ciphertext + authTag)>".
 */
export async function encryptField(plaintext: string, key: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const encoder = new TextEncoder()

  const cipherBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plaintext)
  )

  // Concat IV + ciphertext (GCM auth tag is appended by the API)
  const combined = new Uint8Array(IV_LENGTH + cipherBuffer.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(cipherBuffer), IV_LENGTH)

  return ENCRYPTION_PREFIX + uint8ToBase64(combined)
}

/**
 * Decrypt an encrypted field string.
 * If the value is NOT prefixed with "enc:v1:", returns it as-is (legacy plaintext).
 * Returns null only when decryption fails (wrong key / corrupted data).
 */
export async function decryptField(
  encrypted: string | null | undefined,
  key: CryptoKey
): Promise<string | null> {
  if (!encrypted || typeof encrypted !== 'string') return encrypted ?? null

  // Legacy plaintext — pass through
  if (!encrypted.startsWith(ENCRYPTION_PREFIX)) return encrypted

  try {
    const base64 = encrypted.slice(ENCRYPTION_PREFIX.length)
    const combined = base64ToUint8(base64)

    if (combined.byteLength < IV_LENGTH + 1) return null

    const iv = combined.slice(0, IV_LENGTH)
    const ciphertext = combined.slice(IV_LENGTH)

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    )

    return new TextDecoder().decode(decrypted)
  } catch {
    return null // Wrong key, corrupted, or tampered
  }
}

/**
 * Check if a field value appears to be encrypted.
 */
export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(ENCRYPTION_PREFIX)
}

// ---- Base64 helpers (browser-safe for binary data) ----

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}
