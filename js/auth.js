export const AUTH_KEY = "class-maker:auth:v1";
export const DEFAULT_PARAMS = Object.freeze({
  saltHex: "cefdc6658ede0240d2ffa0b3f5a73e71",
  iterations: 210000,
  hashHex: "1292ccbffb64bf57f492ea35ed2a652b73d46b3d93739b424bad81e96267dfbe",
});

export async function deriveHash(password, saltHex, iterations) {
  if (typeof saltHex !== "string" || !/^(?:[0-9a-f]{2})+$/i.test(saltHex)) {
    throw new Error("saltHex must be even-length hexadecimal");
  }
  const salt = Uint8Array.from(saltHex.match(/../g), (pair) => Number.parseInt(pair, 16));
  const subtle = globalThis.crypto.subtle;
  const key = await subtle.importKey(
    "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"],
  );
  const bits = await subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256,
  );
  return Array.from(new Uint8Array(bits), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function verifyPassword(password, params = DEFAULT_PARAMS) {
  if (typeof password !== "string" || password.length === 0) return false;
  try {
    if (!globalThis.crypto?.subtle) return false;
    const hash = await deriveHash(password, params.saltHex, params.iterations);
    if (hash.length !== params.hashHex.length) return false;
    let difference = 0;
    for (let index = 0; index < hash.length; index += 1) {
      difference |= hash.charCodeAt(index) ^ params.hashHex.charCodeAt(index);
    }
    return difference === 0;
  } catch {
    return false;
  }
}

export function isLoggedIn(storage) {
  try {
    return storage.getItem(AUTH_KEY) === DEFAULT_PARAMS.hashHex;
  } catch {
    return false;
  }
}

export function saveLogin(storage) {
  try {
    storage.setItem(AUTH_KEY, DEFAULT_PARAMS.hashHex);
    return true;
  } catch {
    return false;
  }
}

export function clearLogin(storage) {
  try {
    storage.removeItem(AUTH_KEY);
  } catch {
    // A blocked store must not prevent the current page from locking.
  }
}
