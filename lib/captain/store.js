import { mkdir, open, readFile, readdir, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
/** A single-host durable store, with exclusive repository leases across DSH processes. */
export class RunStore {
    directory;
    leases = new Map();
    writes = Promise.resolve();
    constructor(directory) { this.directory = directory; }
    async loadAll() {
        await mkdir(this.directory, { recursive: true });
        const result = [];
        for (const name of await readdir(this.directory)) {
            if (!name.endsWith('.json'))
                continue;
            try {
                const value = JSON.parse(await readFile(join(this.directory, name), 'utf8'));
                if (!value || typeof value !== 'object')
                    throw new Error('not an object');
                const run = value;
                if (run.version !== 1 || typeof run.id !== 'string' || typeof run.captainSessionId !== 'string' || !['running', 'paused', 'draining', 'stopped'].includes(run.status) || !Array.isArray(run.tasks) || !Array.isArray(run.tickets) || !Array.isArray(run.questions) || !run.config)
                    throw new Error('invalid run schema');
                result.push(run);
            }
            catch (error) {
                throw new Error(`Corrupt captain state ${name}: ${String(error)}`);
            }
        }
        return result;
    }
    async save(run) {
        if (!/^[a-zA-Z0-9-]+$/.test(run.id))
            throw new Error('Invalid run identity');
        const data = JSON.stringify(run, null, 2);
        const write = async () => {
            await mkdir(this.directory, { recursive: true });
            const destination = join(this.directory, `${run.id}.json`);
            const temporary = `${destination}.${randomUUID()}.tmp`;
            const handle = await open(temporary, 'wx', 0o600);
            try {
                await handle.writeFile(data);
                await handle.sync();
            }
            finally {
                await handle.close();
            }
            await rename(temporary, destination);
        };
        const pending = this.writes.then(write);
        this.writes = pending.catch(() => { });
        await pending;
    }
    lockPath(key) { return join(this.directory, `${createHash('sha256').update(key).digest('hex')}.lock`); }
    async acquire(key) {
        if (this.leases.has(key))
            return;
        await mkdir(this.directory, { recursive: true });
        const path = this.lockPath(key), token = randomUUID();
        const take = async () => {
            const file = await open(path, 'wx', 0o600);
            try {
                await file.writeFile(JSON.stringify({ pid: process.pid, token }));
                await file.sync();
            }
            finally {
                await file.close();
            }
            this.leases.set(key, token);
        };
        try {
            await take();
        }
        catch (error) {
            if (error.code !== 'EEXIST')
                throw error;
            const recoveryPath = `${path}.recovery`;
            let recovery;
            try {
                recovery = await open(recoveryPath, 'wx', 0o600);
            }
            catch {
                throw new Error('Repository owned by another captain or recovery in progress');
            }
            try {
                // Re-read only after holding the recovery guard: an earlier claimant may have installed a live owner.
                let owner;
                try {
                    owner = JSON.parse(await readFile(path, 'utf8'));
                }
                catch {
                    throw new Error('Repository owned by an incomplete lease; inspect state before recovery');
                }
                if (!Number.isSafeInteger(owner.pid) || owner.pid <= 0 || typeof owner.token !== 'string')
                    throw new Error('Repository owned by an invalid lease');
                let alive = true;
                try {
                    process.kill(owner.pid, 0);
                }
                catch (error) {
                    if (error.code === 'ESRCH')
                        alive = false;
                }
                if (alive)
                    throw new Error('Repository already owned by another captain');
                await unlink(path);
                await take();
            }
            finally {
                await recovery.close();
                await unlink(recoveryPath);
            }
        }
    }
    async release(key) {
        const token = this.leases.get(key);
        if (!token)
            return;
        const path = this.lockPath(key);
        const owner = JSON.parse(await readFile(path, 'utf8'));
        if (owner.token !== token)
            throw new Error('Repository lease ownership changed');
        await unlink(path);
        this.leases.delete(key);
    }
    async dispose() { await this.writes; for (const key of this.leases.keys())
        await this.release(key); }
}
