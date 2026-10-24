import { mkdir, open, readFile, rename, chmod, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

export function defaultAuthPath(env = process.env) {
  return join(env.DSH_HOME || join(homedir(), '.dsh'), 'plugins', 'antigravity', 'auth.json');
}

// Dedicated file: never import or modify another application's credential store.
export function createAuthStore(path = defaultAuthPath()) {
  let queue = Promise.resolve();
  const serialize = operation => {
    const next = queue.then(operation);
    queue = next.catch(() => {});
    return next;
  };
  async function read() {
    try {
      const data = JSON.parse(await readFile(path, 'utf8'));
      if (data.version !== 1 || typeof data.credentials?.refresh !== 'string') {
        throw new Error('Invalid Antigravity credential file; sign in again.');
      }
      return data.credentials;
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }
  async function save(credentials) {
    if (!credentials || typeof credentials.refresh !== 'string' || !credentials.refresh) {
      throw new Error('OAuth did not return a refresh token.');
    }
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await chmod(dirname(path), 0o700);
    const temp = `${path}.${randomUUID()}.tmp`;
    try {
      const file = await open(temp, 'wx', 0o600);
      try {
        await file.writeFile(JSON.stringify({ version: 1, credentials }) + '\n');
        await file.sync();
      } finally { await file.close(); }
      await rename(temp, path);
    } finally { await unlink(temp).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
  }
  return {
    path,
    read: () => serialize(read),
    write: credentials => serialize(() => save(credentials)),
    remove: () => serialize(async () => {
      try { await unlink(path); return true; }
      catch (error) { if (error.code === 'ENOENT') return false; throw error; }
    }),
    // Bridge the adapter's existing record seam without writing host-wide records.
    readRecord: () => serialize(async () => {
      const payload = await read();
      return payload ? { kind: 'grant', payload } : undefined;
    }),
    modifyRecord: (_key, update) => serialize(async () => {
      const credentials = await read();
      // Refresh must never resurrect credentials after logout.
      if (!credentials) throw new Error('Antigravity signed out during token refresh.');
      const next = update({ kind: 'grant', payload: credentials });
      await save(next.payload);
    }),
  };
}
