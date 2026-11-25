const PBKDF2_ITERATIONS = 100000;

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(str) {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

async function derivePbkdf2Bits(secret, salt) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return new Uint8Array(bits);
}

async function derivePbkdf2AesKey(secret, salt, usage) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage]
  );
}

/**
 * Encrypts a post body using PBKDF2 + AES-GCM (v2 format).
 * Verification hash and encryption key use independent salts and domain prefixes
 * so reading passphrase_hash never reveals the decryption key.
 */
export async function lockPostBody(plaintext, passphrase) {
  const authSalt = crypto.getRandomValues(new Uint8Array(16));
  const encSalt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const authBits = await derivePbkdf2Bits(`arkive-auth:${passphrase}`, authSalt);
  const encKey = await derivePbkdf2AesKey(`arkive-enc:${passphrase}`, encSalt, 'encrypt');

  const cipherBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    encKey,
    new TextEncoder().encode(plaintext || '')
  );

  return {
    passphraseHash: `v2:${bytesToBase64(authSalt)}:${bytesToBase64(authBits)}`,
    encryptedBody: `v2:${bytesToBase64(encSalt)}:${bytesToBase64(iv)}:${bytesToBase64(new Uint8Array(cipherBuffer))}`,
  };
}

/**
 * Decrypts both v2 (PBKDF2) and legacy v1 (SHA-256) locked posts.
 */
export async function unlockPostBody(passphraseHash, encryptedBody, passphrase) {
  if (!passphraseHash || !encryptedBody) {
    throw new Error('Missing encrypted post data.');
  }

  if (passphraseHash.startsWith('v2:') && encryptedBody.startsWith('v2:')) {
    const [, authSaltB64, authHashB64] = passphraseHash.split(':');
    const authSalt = base64ToBytes(authSaltB64);
    const expectedAuth = base64ToBytes(authHashB64);
    const actualAuth = await derivePbkdf2Bits(`arkive-auth:${passphrase}`, authSalt);

    if (!constantTimeEqual(actualAuth, expectedAuth)) {
      throw new Error('Incorrect passphrase');
    }

    const [, encSaltB64, ivB64, cipherB64] = encryptedBody.split(':');
    const encSalt = base64ToBytes(encSaltB64);
    const iv = base64ToBytes(ivB64);
    const cipherBytes = base64ToBytes(cipherB64);

    const encKey = await derivePbkdf2AesKey(`arkive-enc:${passphrase}`, encSalt, 'decrypt');
    const plainBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, encKey, cipherBytes);
    return new TextDecoder().decode(plainBuffer);
  }

  // Legacy v1 format (migrated from Pvt-Diary / Supabase)
  const data = new TextEncoder().encode(passphrase);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashHex = Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

  if (hashHex !== passphraseHash) {
    throw new Error('Incorrect passphrase');
  }

  const combined = base64ToBytes(encryptedBody);
  const iv = combined.slice(0, 12);
  const encrypted = combined.slice(12);
  const key = await crypto.subtle.importKey('raw', hashBuffer, 'AES-GCM', false, ['decrypt']);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, encrypted);
  return new TextDecoder().decode(decrypted);
}
