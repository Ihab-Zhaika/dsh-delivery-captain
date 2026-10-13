import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { chmod, copyFile, lstat, mkdir, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { isAbsolute, join, parse, relative, resolve, sep } from 'node:path'
import { findTeamByCaptain, readArchivedTeam, readRetiredMemberIds, readTeam, sanitizeKey, withTeamLock } from './state.ts'
import type { TeamState } from './types.ts'

export const ARCHIVED_TEAM_RESTORE_SCHEMA = 'agent-teams/archive-restore/v1'
export const ARCHIVED_TEAM_RESTORE_RECEIPT = '.archive-restore-receipt.json'
const STAGING_DIRECTORY = '.archive-restore-staging'

interface Entry { path: string; kind: 'file' | 'directory'; mode: number; size?: number; sha256?: string }
interface Manifest { entries: Entry[]; fingerprint: string }
interface Receipt {
  schema_version: typeof ARCHIVED_TEAM_RESTORE_SCHEMA
  team_id: string
  captain_session_id: string
  workspace: string
  archive_path: string
  archive_fingerprint: string
  restored_at: number
  reason: string
  publication_state: 'prepared' | 'verified'
}
interface RestoreResult {
  schema_version: typeof ARCHIVED_TEAM_RESTORE_SCHEMA
  status: 'restored' | 'already_restored'
  team_id: string
  captain_session_id: string
  archive_fingerprint: string
  restored_at: number
  reason: string
  members: number
  tasks: number
  work_started: false
}

function key(path: string): string { const absolute = resolve(path); return process.platform === 'win32' ? absolute.toLowerCase() : absolute }
function contained(root: string, target: string): boolean {
  const path = relative(root, target)
  return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`))
}
async function optionalStat(path: string) {
  try { return await lstat(path) } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error }
}

/** Inspect every existing ancestor, rejecting symlinks/junctions before descending or mutating. */
async function safePath(workspace: string, target: string, kind: 'file' | 'directory', absent = false): Promise<boolean> {
  if (!isAbsolute(workspace) || !isAbsolute(target) || !contained(workspace, target)) throw new Error('Archive restore path escapes its native workspace')
  const root = parse(target).root, segments = relative(root, target).split(sep).filter(Boolean)
  let current = root
  for (let index = -1; index < segments.length; index++) {
    if (index >= 0) current = join(current, segments[index]!)
    const stat = await optionalStat(current), last = index === segments.length - 1
    if (!stat) {
      if (last && absent) return false
      throw new Error('Archive restore directory or archive is unavailable')
    }
    if (stat.isSymbolicLink()) throw new Error('Archive restore rejects symbolic links and directory junctions')
    if ((!last || kind === 'directory') ? !stat.isDirectory() : !stat.isFile()) throw new Error('Archive restore requires regular files and real directories')
  }
  if (key(await realpath(target)) !== key(target)) throw new Error('Archive restore resolved path changed or escaped containment')
  return true
}

/** Complete sorted inventory includes directories and raw file bytes; no archive file is rewritten. */
async function manifest(workspace: string, root: string, signal: AbortSignal): Promise<Manifest> {
  await safePath(workspace, root, 'directory')
  const entries: Entry[] = []
  const walk = async (directory: string, prefix: string): Promise<void> => {
    signal.throwIfAborted()
    await safePath(workspace, directory, 'directory')
    const names = (await readdir(directory)).sort()
    for (const name of names) {
      signal.throwIfAborted()
      const path = join(directory, name), relativePath = prefix ? `${prefix}/${name}` : name
      if (!contained(root, path)) throw new Error('Archive inventory escapes the selected team directory')
      const stat = await lstat(path)
      if (stat.isSymbolicLink()) throw new Error('Archive restore rejects symbolic links and directory junctions')
      if (stat.isDirectory()) {
        await safePath(workspace, path, 'directory')
        entries.push({ path: relativePath, kind: 'directory', mode: stat.mode & 0o777 })
        await walk(path, relativePath)
      } else {
        await safePath(workspace, path, 'file')
        if (stat.nlink > 1) throw new Error('Archive restore rejects hard-linked files')
        const bytes = await readFile(path, { signal })
        entries.push({ path: relativePath, kind: 'file', mode: stat.mode & 0o777, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })
      }
    }
  }
  await walk(root, '')
  return { entries, fingerprint: createHash('sha256').update(JSON.stringify(entries)).digest('hex') }
}

function exactCaptain(ctx: Context, agent: Agent | undefined): Agent {
  if (!agent || !agent.id || agent.session.id !== agent.id || agent.session.header.id !== agent.id || ctx.agents.get(agent.id) !== agent) throw new Error('Archive restore requires the exact registered original captain and native session')
  if (!agent.session.header.cwd || !isAbsolute(agent.session.header.cwd)) throw new Error('Archive restore requires the original captain native absolute workspace')
  return agent
}
function owns(team: TeamState | undefined, teamId: string, captain: Agent): asserts team is TeamState {
  if (!team || team.id !== teamId || team.captainSessionId !== captain.id || team.members.some(member => member.id === captain.id)) throw new Error('Only the exact original captain may restore this archive; no parent, fork, member or foreign owner may adopt it')
}

/** Check top-level state entries before the native ownership lookup can read their team.json. */
async function owningTeam(workspace: string, stateRoot: string, captain: Agent): Promise<TeamState | undefined> {
  await safePath(workspace, stateRoot, 'directory')
  for (const name of await readdir(stateRoot)) {
    const path = join(stateRoot, name), stat = await lstat(path)
    if (stat.isSymbolicLink()) throw new Error('Active team path is a symbolic link or junction')
    if (stat.isDirectory()) {
      await safePath(workspace, path, 'directory')
      await safePath(workspace, join(path, 'team.json'), 'file', true)
    }
  }
  return findTeamByCaptain(stateRoot, captain.id)
}

function validateReceipt(value: unknown, expected: Omit<Receipt, 'reason' | 'restored_at'>): Receipt {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid archive restore receipt')
  const receipt = value as Receipt
  const keys = ['schema_version', 'team_id', 'captain_session_id', 'workspace', 'archive_path', 'archive_fingerprint', 'restored_at', 'reason', 'publication_state']
  if (Object.keys(receipt).length !== keys.length || keys.some(name => !Object.hasOwn(receipt, name)) || !Number.isSafeInteger(receipt.restored_at) || receipt.restored_at < 1 || typeof receipt.reason !== 'string' || !receipt.reason.trim()) throw new Error('Malformed archive restore receipt')
  for (const name of Object.keys(expected) as Array<keyof typeof expected>) if (receipt[name] !== expected[name]) throw new Error('Archive restore receipt owner, workspace or archive fingerprint drifted')
  return receipt
}

function receiptText(receipt: Receipt): string { return JSON.stringify(receipt, null, 2) + '\n' }

/** Match the original complete payload plus precisely this tool-owned receipt; arbitrary extra files cannot be waived. */
async function verifyCopy(workspace: string, directory: string, original: Manifest, receipt: string, signal: AbortSignal): Promise<void> {
  const current = await manifest(workspace, directory, signal)
  const marker = current.entries.find(entry => entry.path === ARCHIVED_TEAM_RESTORE_RECEIPT)
  if (marker?.kind !== 'file' || marker.size !== Buffer.byteLength(receipt) || marker.sha256 !== createHash('sha256').update(receipt).digest('hex')) throw new Error('Known archive restore receipt changed during publication')
  const payload = current.entries.filter(entry => entry.path !== ARCHIVED_TEAM_RESTORE_RECEIPT)
  if (createHash('sha256').update(JSON.stringify(payload)).digest('hex') !== original.fingerprint) throw new Error('Archived team copied payload changed during publication')
}

async function verifyArchive(workspace: string, archive: string, original: Manifest, signal: AbortSignal): Promise<void> {
  if ((await manifest(workspace, archive, signal)).fingerprint !== original.fingerprint) throw new Error('Archive fingerprint changed during restoration')
}

async function restore(ctx: Context, config: { stateDir: string }, teamId: string, reason: string, candidate: Agent | undefined, signal: AbortSignal): Promise<RestoreResult> {
  signal.throwIfAborted()
  const captain = exactCaptain(ctx, candidate), session = captain.session, header = session.header, workspace = resolve(header.cwd!)
  if (!reason.trim()) throw new Error('Archive restore requires the explicit continuation reason')
  if (!teamId || sanitizeKey(teamId) !== teamId || teamId === 'archive' || teamId.includes(':')) throw new Error('Archive restore requires a safe original team id')
  if (!/^\.?[a-zA-Z0-9_-]+$/.test(config.stateDir) || config.stateDir === '.' || config.stateDir === '..') throw new Error('Archive restore state directory must be one safe workspace segment')
  const stateRoot = join(workspace, config.stateDir), archive = join(stateRoot, 'archive', teamId), active = join(stateRoot, teamId)
  const unchangedCaller = () => {
    signal.throwIfAborted(); exactCaptain(ctx, captain)
    if (captain.session !== session || session.header !== header || key(header.cwd!) !== key(workspace)) throw new Error('Original captain session or workspace changed during restore')
  }
  await safePath(workspace, archive, 'directory')
  await safePath(workspace, active, 'directory', true)
  return withTeamLock(`captain:${stateRoot}:${captain.id}`, () => withTeamLock(`team:${stateRoot}:${teamId}`, () => withTeamLock(`retired-members:${stateRoot}`, async () => {
    unchangedCaller()
    await safePath(workspace, archive, 'directory')
    const source = await readArchivedTeam(stateRoot, teamId)
    owns(source, teamId, captain)
    if (source.members.some(member => member.status !== 'removed')) throw new Error('Only an archived fully removed roster may use this nonactivating restoration lifecycle')
    const retiredPath = join(stateRoot, 'retired-members.json')
    await safePath(workspace, retiredPath, 'file', true)
    const retired = await readRetiredMemberIds(stateRoot)
    if (source.members.some(member => member.status === 'removed' && member.id !== '' && !retired.has(member.id))) throw new Error('Archive removed identities are missing from the native retired member index')
    const original = await manifest(workspace, archive, signal)
    if (original.entries.some(entry => entry.path === ARCHIVED_TEAM_RESTORE_RECEIPT)) throw new Error('This archive already contains prior restore evidence; repeated archive generations require separate authorization')
    const expected = { schema_version: ARCHIVED_TEAM_RESTORE_SCHEMA, team_id: teamId, captain_session_id: captain.id, workspace, archive_path: archive, archive_fingerprint: original.fingerprint } as const
    const current = await owningTeam(workspace, stateRoot, captain)
    if (current && current.id !== teamId) throw new Error('Original captain already owns another active team')
    if (await safePath(workspace, active, 'directory', true)) {
      const existing = await readTeam(stateRoot, teamId)
      owns(existing, teamId, captain)
      const path = join(active, ARCHIVED_TEAM_RESTORE_RECEIPT)
      await safePath(workspace, path, 'file')
      const knownText = await readFile(path, { encoding: 'utf8', signal })
      const receipt = validateReceipt(JSON.parse(knownText), { ...expected, publication_state: 'verified' })
      unchangedCaller()
      // Native caller checks can yield changed state; revalidate the owner and the exact known receipt afterward.
      await safePath(workspace, active, 'directory')
      const finalTeam = await readTeam(stateRoot, teamId)
      owns(finalTeam, teamId, captain)
      await safePath(workspace, path, 'file')
      if (await readFile(path, { encoding: 'utf8', signal }) !== knownText) throw new Error('Archive restore receipt changed during idempotent adoption')
      await verifyArchive(workspace, archive, original, signal)
      signal.throwIfAborted()
      const result: RestoreResult = { schema_version: ARCHIVED_TEAM_RESTORE_SCHEMA, status: 'already_restored', team_id: teamId, captain_session_id: captain.id, archive_fingerprint: original.fingerprint, restored_at: receipt.restored_at, reason: receipt.reason, members: finalTeam.members.length, tasks: finalTeam.tasks.length, work_started: false }
      return result
    }
    const stagingParent = join(stateRoot, STAGING_DIRECTORY)
    if (!await safePath(workspace, stagingParent, 'directory', true)) await mkdir(stagingParent)
    await safePath(workspace, stagingParent, 'directory')
    const slot = join(stagingParent, randomUUID())
    await mkdir(slot)
    const identity = await lstat(slot)
    const stage = join(slot, teamId)
    let published = false
    try {
      await safePath(workspace, slot, 'directory')
      await mkdir(stage)
      for (const entry of original.entries) {
        unchangedCaller()
        const from = join(archive, ...entry.path.split('/')), to = join(stage, ...entry.path.split('/'))
        if (!contained(archive, from) || !contained(stage, to)) throw new Error('Archive staging path escaped containment')
        await safePath(workspace, from, entry.kind)
        await safePath(workspace, to, entry.kind, true)
        if (entry.kind === 'directory') { await mkdir(to, { mode: entry.mode }); await chmod(to, entry.mode) }
        else await copyFile(from, to, constants.COPYFILE_EXCL)
      }
      const staged = await readTeam(slot, teamId)
      owns(staged, teamId, captain)
      if ((await manifest(workspace, stage, signal)).fingerprint !== original.fingerprint || (await manifest(workspace, archive, signal)).fingerprint !== original.fingerprint) throw new Error('Archive or staged snapshot changed during restore')
      const receipt: Receipt = { ...expected, restored_at: Date.now(), reason, publication_state: 'prepared' }
      const preparedText = receiptText(receipt)
      await writeFile(join(stage, ARCHIVED_TEAM_RESTORE_RECEIPT), preparedText, { encoding: 'utf8', flag: 'wx', mode: 0o600, signal })
      await safePath(workspace, stage, 'directory')
      if (await safePath(workspace, active, 'directory', true)) throw new Error('Active destination appeared during archived team restore')
      if ((await owningTeam(workspace, stateRoot, captain)) !== undefined) throw new Error('Another active team appeared during restore')
      unchangedCaller()
      // Final payload proof follows every caller/path/owner check. No native callback runs between proof and rename.
      await verifyCopy(workspace, stage, original, preparedText, signal)
      await verifyArchive(workspace, archive, original, signal)
      signal.throwIfAborted()
      // Same filesystem; native captain/team locks exclude conflicting API publishers. Windows rejects an existing destination.
      await rename(stage, active)
      published = true
      // Until this proof succeeds, the retained active copy has only a prepared receipt and cannot be idempotently adopted.
      await safePath(workspace, active, 'directory')
      const activeIdentity = await lstat(active)
      const finalTeam = await readTeam(stateRoot, teamId)
      owns(finalTeam, teamId, captain)
      unchangedCaller()
      await verifyCopy(workspace, active, original, preparedText, signal)
      await verifyArchive(workspace, archive, original, signal)
      signal.throwIfAborted()
      const verifiedText = receiptText({ ...receipt, publication_state: 'verified' })
      const marker = join(active, ARCHIVED_TEAM_RESTORE_RECEIPT), temporary = join(active, `.archive-restore-verified-${randomUUID()}.tmp`)
      await safePath(workspace, active, 'directory')
      const latestIdentity = await lstat(active)
      if (activeIdentity.dev !== latestIdentity.dev || activeIdentity.ino !== latestIdentity.ino) throw new Error('Published active directory ownership changed')
      await safePath(workspace, marker, 'file')
      if (await readFile(marker, { encoding: 'utf8', signal }) !== preparedText) throw new Error('Prepared restore receipt changed before verification seal')
      await writeFile(temporary, verifiedText, { encoding: 'utf8', flag: 'wx', mode: 0o600, signal })
      await safePath(workspace, temporary, 'file')
      await safePath(workspace, marker, 'file')
      signal.throwIfAborted()
      // Only replace this operation's exact prepared metadata. The source archive and every team payload file remain untouched.
      await rename(temporary, marker)
      const result: RestoreResult = { schema_version: ARCHIVED_TEAM_RESTORE_SCHEMA, status: 'restored', team_id: teamId, captain_session_id: captain.id, archive_fingerprint: original.fingerprint, restored_at: receipt.restored_at, reason, members: staged.members.length, tasks: staged.tasks.length, work_started: false }
      return result
    } catch (error) {
      if (published) throw new Error(`Archive restore publication is unverified; active bytes retained for inspection, no restore success: ${error instanceof Error ? error.message : 'verification failed'}`, { cause: error })
      throw error
    } finally {
      // Only this exclusively-created staging slot may be recursively removed. Archives/active copies are never cleanup targets.
      if (!contained(stagingParent, slot) || key(slot) === key(stagingParent) || contained(slot, archive) || contained(slot, active)) throw new Error('Unsafe archive restore staging cleanup target')
      await safePath(workspace, slot, 'directory')
      const fresh = await lstat(slot)
      if (fresh.dev !== identity.dev || fresh.ino !== identity.ino) throw new Error('Archive restore staging ownership changed; cleanup rejected')
      await manifest(workspace, slot, new AbortController().signal)
      await rm(slot, { recursive: true, force: true })
    }
  })))
}

/**
 * Register the exact-original-captain archived state restoration tool.
 * @param ctx - Native tools and Agent registry owning the effect.
 * @param config - Original AgentTeams state directory under the native workspace.
 * @returns Nothing; the native registry owns registration and unload cleanup.
 */
export function registerArchivedTeamRestoreTool(ctx: Context, config: { stateDir: string }): void {
  ctx.tools.register(defineTool({
    name: 'agent_teams_restore',
    description: 'Restore your own original archived team into active state only after explicit user approval to continue that same assignment. Exact original captain only. Preserves all tasks, attempts, members, retired identities, evidence and mailboxes; retains the archive unchanged. Does not resume work or wake members. Afterwards use existing Original AgentTeams APIs for authorized continuation.',
    parameters: { team_id: { type: 'string', required: true, description: 'Exact original archived team id in your native workspace.' }, reason: { type: 'string', required: true, description: 'Explicit user-approved reason to continue this same original assignment.' } },
    output: { schema: { type: 'object', additionalProperties: false, properties: {
      schema_version: { type: 'string', enum: [ARCHIVED_TEAM_RESTORE_SCHEMA], required: true },
      status: { type: 'string', enum: ['restored', 'already_restored'], required: true },
      team_id: { type: 'string', required: true }, captain_session_id: { type: 'string', required: true }, archive_fingerprint: { type: 'string', required: true },
      restored_at: { type: 'integer', required: true }, reason: { type: 'string', required: true }, members: { type: 'integer', required: true }, tasks: { type: 'integer', required: true }, work_started: { type: 'boolean', enum: [false], required: true },
    } }, render: (_args, value) => [{ type: 'text', text: `Original team ${value.team_id} ${value.status === 'restored' ? 'restored' : 'already restored'} with ${value.tasks} preserved tasks and ${value.members} unchanged members. Archive retained unchanged. No work resumed or started; removed members remain removed and terminal tasks remain terminal. Use existing Original AgentTeams APIs only for the separately authorized continuation.` }] },
    execute: (args, exec) => restore(ctx, config, args.team_id, args.reason, exec.agent, exec.signal),
  }))
}
