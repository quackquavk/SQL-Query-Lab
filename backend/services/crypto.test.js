/**
 * Tests for backend/services/crypto.js
 *
 * Run with: MASTER_PASSWORD='test-master-password-32chars!!' node --test services/crypto.test.js
 */

import { test, mock } from 'node:test';
import { strict as assert } from 'node:assert';
import { encryptConnection, decryptConnection, decryptConnectionServer } from './crypto.js';

const VALID_PW = 'test-master-password-32chars!!';

test('encryptConnection + decryptConnection round-trip', async () => {
  const connData = { server: 'localhost', authType: 'sql', credentials: { username: 'sa', password: 'secret' } };
  const blob = await encryptConnection(connData, VALID_PW);
  const decrypted = await decryptConnection(blob, VALID_PW);
  assert.deepEqual(decrypted, connData);
});

test('decryptConnection rejects wrong password', async () => {
  const connData = { server: 'localhost', authType: 'sql', credentials: { username: 'sa', password: 'secret' } };
  const blob = await encryptConnection(connData, VALID_PW);
  await assert.rejects(
    () => decryptConnection(blob, 'wrong-password'),
    /Decryption failed/i
  );
});

test('decryptConnectionServer returns null on wrong blob', async () => {
  const blob = { salt: 'YWJj', iv: 'YWJj', authTag: 'YWJj', encrypted: 'YWJj' }; // garbage base64
  const result = await decryptConnectionServer(blob);
  assert.strictEqual(result, null);
});

test('decryptConnectionServer succeeds with valid blob', async () => {
  const connData = { server: 'localhost', authType: 'sql', credentials: { username: 'sa', password: 'secret' } };
  const blob = await encryptConnection(connData, process.env.MASTER_PASSWORD);
  const result = await decryptConnectionServer(blob);
  assert.deepEqual(result, connData);
});

test('decryptConnectionServer returns null without MASTER_PASSWORD', async () => {
  const orig = process.env.MASTER_PASSWORD;
  try {
    delete process.env.MASTER_PASSWORD;
    const blob = { salt: 'YWJj', iv: 'YWJj', authTag: 'YWJj', encrypted: 'YWJj' };
    const result = await decryptConnectionServer(blob);
    assert.strictEqual(result, null);
  } finally {
    process.env.MASTER_PASSWORD = orig;
  }
});
