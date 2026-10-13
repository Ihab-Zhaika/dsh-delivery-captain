import { mkdir, open, readFile, readdir, rename, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import type { Run } from './types.ts'

/** A single-host durable store, with exclusive repository leases across DSH processes. */
export class RunStore {
  readonly directory: string
  private readonly leases = new Map<string, string>()
  private writes: Promise<void> = Promise.resolve()
  constructor(directory: string) { this.directory = directory }

  async loadAll(): Promise<Run[]> {
    await mkdir(this.directory, { recursive: true })
    const result: Run[] = []
    for (const name of await readdir(this.directory)) {
      if (!name.endsWith('.json')) continue
      try {
        const value: unknown = JSON.parse(await readFile(join(this.directory, name), 'utf8'))
        if (!value || typeof value !== 'object') throw new Error('not an object')
        const run = value as Run
        if (run.version !== 1 || typeof run.id !== 'string' || typeof run.captainSessionId !== 'string' || !['running','paused','draining','stopped'].includes(run.status) || !Array.isArray(run.tasks) || !Array.isArray(run.tickets) || !Array.isArray(run.questions) || !run.config) throw new Error('invalid run schema')
        result.push(run)
      } catch (error) { throw new Error(`Corrupt captain state ${name}: ${String(error)}`) }
    }
    return result
  }

  async save(run: Run): Promise<void> {
    if (!/^[a-zA-Z0-9-]+$/.test(run.id)) throw new Error('Invalid run identity')
    const data = JSON.stringify(run, null, 2)
    const write = async (): Promise<void> => {
      await mkdir(this.directory, { recursive: true })
      const destination = join(this.directory, `${run.id}.json`)
      const temporary = `${destination}.${randomUUID()}.tmp`
      const handle = await open(temporary, 'wx', 0o600)
      try { await handle.writeFile(data); await handle.sync() } finally { await handle.close() }
      await rename(temporary, destination)
    }
    const pending = this.writes.then(write)
    this.writes = pending.catch(() => {})
    await pending
  }

  private lockPath(key: string): string { return join(this.directory, `${createHash('sha256').update(key).digest('hex')}.lock`) }

  async acquire(key: string): Promise<void> {
    if (this.leases.has(key)) return
    await mkdir(this.directory, { recursive: true })
    const path = this.lockPath(key), token = randomUUID()
    const take = async (): Promise<void> => {
      const file = await open(path, 'wx', 0o600)
      try { await file.writeFile(JSON.stringify({ pid: process.pid, token })); await file.sync() } finally { await file.close() }
      this.leases.set(key, token)
    }
    try { await take() } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      const recoveryPath = `${path}.recovery`
      let recovery
      try { recovery = await open(recoveryPath, 'wx', 0o600) } catch { throw new Error('Repository owned by another captain or recovery in progress') }
      try {
        // Re-read only after holding the recovery guard: an earlier claimant may have installed a live owner.
        let owner: { pid: number; token: string }
        try { owner = JSON.parse(await readFile(path, 'utf8')) as typeof owner } catch { throw new Error('Repository owned by an incomplete lease; inspect state before recovery') }
        if (!Number.isSafeInteger(owner.pid) || owner.pid <= 0 || typeof owner.token !== 'string') throw new Error('Repository owned by an invalid lease')
        let alive = true
        try { process.kill(owner.pid, 0) } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') alive = false }
        if (alive) throw new Error('Repository already owned by another captain')
        await unlink(path)
        await take()
      } finally { await recovery.close(); await unlink(recoveryPath) }
    }
  }

  async release(key: string): Promise<void> {
    const token = this.leases.get(key)
    if (!token) return
    const path = this.lockPath(key)
    const owner = JSON.parse(await readFile(path, 'utf8')) as { token: string }
    if (owner.token !== token) throw new Error('Repository lease ownership changed')
    await unlink(path)
    this.leases.delete(key)
  }
  async dispose(): Promise<void> { await this.writes; for (const key of this.leases.keys()) await this.release(key) }
}
