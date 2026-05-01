import { randomBytes, createCipheriv, createDecipheriv, pbkdf2Sync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const SALT_LENGTH = 32;
const IV_LENGTH = 16;
const PBKDF2_ITERATIONS = 100000;

function deriveKey(masterPassword, salt) {
  return pbkdf2Sync(
    masterPassword,
    salt,
    PBKDF2_ITERATIONS,
    KEY_LENGTH,
    'sha256'
  );
}

/**
 * Derives the server-side encryption key from the MASTER_PASSWORD env var.
 * Returns null if the env var is not set.
 */
function getServerKey() {
  const masterPassword = process.env.MASTER_PASSWORD;
  if (!masterPassword) {
    console.error('[crypto] MASTER_PASSWORD env var is not set — server-side decryption unavailable');
    return null;
  }
  // Dummy salt for server key — the actual salt from the blob is used instead.
  // We return the raw password here; deriveKey will combine it with the blob's salt.
  return masterPassword;
}

async function encryptConnection(connectionData, masterPassword) {
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const key = deriveKey(masterPassword, salt);

  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(connectionData), 'utf8'),
    cipher.final()
  ]);

  const authTag = cipher.getAuthTag();

  return {
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    encrypted: encrypted.toString('base64')
  };
}

async function decryptConnection(blob, masterPassword) {
  try {
    const salt = Buffer.from(blob.salt, 'base64');
    const iv = Buffer.from(blob.iv, 'base64');
    const authTag = Buffer.from(blob.authTag, 'base64');
    const encrypted = Buffer.from(blob.encrypted, 'base64');

    const key = deriveKey(masterPassword, salt);

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);

    return JSON.parse(decrypted.toString('utf8'));
  } catch (err) {
    throw new Error('Decryption failed - invalid password or corrupted data');
  }
}

/**
 * Server-side decryption — uses MASTER_PASSWORD env var, no client password needed.
 * Returns null and logs on failure.
 */
async function decryptConnectionServer(blob) {
  const serverKey = getServerKey();
  if (!serverKey) {
    console.error('[crypto] decryptConnectionServer: MASTER_PASSWORD not configured');
    return null;
  }
  try {
    return await decryptConnection(blob, serverKey);
  } catch (err) {
    console.error('[crypto] decryptConnectionServer: decryption failed', err.message);
    return null;
  }
}

export { encryptConnection, decryptConnection, decryptConnectionServer };