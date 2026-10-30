import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTH_KEY, DEFAULT_PARAMS, deriveHash, verifyPassword, isLoggedIn, saveLogin, clearLogin,
} from '../js/auth.js';

function memoryStorage() {
  const entries = new Map();
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
    removeItem: (key) => entries.delete(key),
  };
}

test('deriveHash matches the PBKDF2-HMAC-SHA256 fixed vector', async () => {
  assert.equal(await deriveHash('password', '73616c74', 1),
    '120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b');
});

test('deriveHash accepts uppercase salt hex and returns lowercase 32-byte hex', async () => {
  assert.equal(await deriveHash('password', '73616C74', 1),
    '120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b');
});

test('deriveHash rejects salt that is not even-length hex', async () => {
  for (const salt of ['', '0', '123', 'gg', '0x12', '12 34', null, undefined, 12]) {
    await assert.rejects(deriveHash('test-pw', salt, 1000), Error);
  }
});

test('verifyPassword accepts a matching test password and rejects wrong passwords', async () => {
  const params = { saltHex: '0011223344556677', iterations: 1000 };
  params.hashHex = await deriveHash('test-pw', params.saltHex, params.iterations);
  assert.equal(await verifyPassword('test-pw', params), true);
  assert.equal(await verifyPassword('wrong-pw', params), false);
});

test('verifyPassword compares every hash position and requires equal lengths', async () => {
  const params = { saltHex: '10203040', iterations: 1000 };
  const hash = await deriveHash('test-pw', params.saltHex, params.iterations);
  for (let index = 0; index < hash.length; index += 1) {
    const character = hash[index] === '0' ? '1' : '0';
    params.hashHex = hash.slice(0, index) + character + hash.slice(index + 1);
    assert.equal(await verifyPassword('test-pw', params), false);
  }
  for (const hashHex of [hash.slice(1), hash + '0']) {
    assert.equal(await verifyPassword('test-pw', { ...params, hashHex }), false);
  }
});

test('verifyPassword preserves spaces and UTF-8 characters in test passwords', async () => {
  const params = { saltHex: 'aabbccdd', iterations: 1000 };
  params.hashHex = await deriveHash(' 가상-암호 ', params.saltHex, params.iterations);
  assert.equal(await verifyPassword(' 가상-암호 ', params), true);
  assert.equal(await verifyPassword('가상-암호', params), false);
});

test('verifyPassword returns false for empty or non-string passwords', async () => {
  for (const password of ['', null, undefined, 0, 1234, {}, [], true]) {
    assert.equal(await verifyPassword(password), false);
  }
});

test('verifyPassword returns false when Web Crypto or subtle is unavailable', async (t) => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  t.after(() => Object.defineProperty(globalThis, 'crypto', descriptor));
  for (const value of [undefined, {}]) {
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value });
    assert.equal(await verifyPassword('test-pw'), false);
  }
});

test('DEFAULT_PARAMS contains the required PBKDF2 parameter formats', () => {
  assert.match(DEFAULT_PARAMS.saltHex, /^[0-9a-f]{32}$/);
  assert.match(DEFAULT_PARAMS.hashHex, /^[0-9a-f]{64}$/);
  assert.equal(DEFAULT_PARAMS.iterations, 210000);
});

test('login is saved and removed without touching the existing draft', () => {
  const storage = memoryStorage();
  storage.setItem('class-maker:draft:v1', 'test draft');
  assert.equal(isLoggedIn(storage), false);
  assert.equal(saveLogin(storage), true);
  assert.equal(storage.getItem(AUTH_KEY), DEFAULT_PARAMS.hashHex);
  assert.equal(isLoggedIn(storage), true);
  clearLogin(storage);
  assert.equal(storage.getItem(AUTH_KEY), null);
  assert.equal(isLoggedIn(storage), false);
  assert.equal(storage.getItem('class-maker:draft:v1'), 'test draft');
});

test('isLoggedIn requires the exact stored hash rather than truthy markers', () => {
  const storage = memoryStorage();
  for (const marker of ['true', '1', '', DEFAULT_PARAMS.hashHex.slice(1), DEFAULT_PARAMS.hashHex + '0']) {
    storage.setItem(AUTH_KEY, marker);
    assert.equal(isLoggedIn(storage), false);
  }
});

test('storage helpers tolerate null, undefined, and throwing storage methods', () => {
  const blocked = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
    removeItem() { throw new Error('blocked'); },
  };
  for (const storage of [null, undefined, blocked]) {
    assert.equal(isLoggedIn(storage), false);
    assert.equal(saveLogin(storage), false);
    assert.doesNotThrow(() => clearLogin(storage));
  }
});
