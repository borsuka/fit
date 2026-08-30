import * as SecureStore from 'expo-secure-store';

/**
 * Session storage adapter for Supabase Auth, backed by the device keychain.
 *
 * Why not AsyncStorage, which most examples use: it is unencrypted plain text
 * on disk. The value it would hold is a refresh token — the credential that
 * mints access tokens for this account indefinitely. On a rooted or jailbroken
 * device, or through a backup extraction, that is a full account takeover from
 * a file anyone can read.
 *
 * The complication is size. SecureStore warns above 2048 bytes per value, and
 * a Supabase session (access token, refresh token, user object with metadata)
 * frequently exceeds it. So values are chunked across numbered keys, with a
 * small header recording the chunk count.
 *
 * Layout for key K:
 *   K            -> the chunk count, as a decimal string
 *   K.0 .. K.n-1 -> the payload slices
 */

const CHUNK_SIZE = 1800; // headroom under the 2048-byte warning threshold

const chunkKey = (key: string, index: number): string => `${key}.${index}`;

const readCount = async (key: string): Promise<number | null> => {
  const header = await SecureStore.getItemAsync(key);
  if (header === null) return null;
  const count = Number.parseInt(header, 10);
  return Number.isInteger(count) && count > 0 ? count : null;
};

/**
 * Removes every chunk belonging to a key. Called before each write as well as
 * on removal: without it, shrinking a session from four chunks to two would
 * leave the stale third and fourth behind, and the next read of a longer
 * session would splice them back in and produce unparseable JSON.
 */
const clearChunks = async (key: string, count: number): Promise<void> => {
  const deletions: Promise<void>[] = [];
  for (let i = 0; i < count; i += 1) {
    deletions.push(SecureStore.deleteItemAsync(chunkKey(key, i)));
  }
  await Promise.all(deletions);
};

export const secureSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      const count = await readCount(key);
      if (count === null) return null;

      const parts = await Promise.all(
        Array.from({ length: count }, (_, i) => SecureStore.getItemAsync(chunkKey(key, i))),
      );

      // A missing chunk means a partial write, or storage cleared underneath
      // us. Returning a truncated string would hand Supabase malformed JSON;
      // returning null makes it treat the user as signed out, which is
      // recoverable by signing in again.
      if (parts.some((p) => p === null)) return null;

      return parts.join('');
    } catch {
      // Keychain access can fail on a locked device. Signed out is the safe
      // reading - never throw out of a storage adapter, or auth init crashes
      // the app before the first screen renders.
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    try {
      const previous = await readCount(key);
      if (previous !== null) await clearChunks(key, previous);

      const chunks: string[] = [];
      for (let i = 0; i < value.length; i += CHUNK_SIZE) {
        chunks.push(value.slice(i, i + CHUNK_SIZE));
      }

      await Promise.all(
        chunks.map((chunk, i) => SecureStore.setItemAsync(chunkKey(key, i), chunk)),
      );

      // Header last: until it is written the value is not readable, so a
      // failure part-way through leaves the user signed out rather than
      // holding a half-written session that fails in a stranger way.
      await SecureStore.setItemAsync(key, String(chunks.length));
    } catch {
      // Swallowed deliberately. A failed session persist means the user must
      // sign in again next launch, which is an inconvenience; an exception
      // here would surface as an unhandled rejection during auth refresh.
    }
  },

  async removeItem(key: string): Promise<void> {
    try {
      const count = await readCount(key);
      if (count !== null) await clearChunks(key, count);
      await SecureStore.deleteItemAsync(key);
    } catch {
      // Nothing useful to do; sign-out must not fail.
    }
  },
};
