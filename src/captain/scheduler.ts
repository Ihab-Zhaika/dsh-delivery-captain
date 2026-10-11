import { isAbsolute } from 'node:path'
import type { RunConfig, Task, Ticket } from './types.ts'

export interface Eligibility { ticketId: string; eligible: boolean; reason: string }

/** Resolve the complete predecessor closure; related links never enter this graph. */
export function eligibility(tickets: Ticket[], milestones: string[], tasks: Pick<Task, 'ticket' | 'status' | 'closedAt'>[]): Eligibility[] {
  const byId = new Map(tickets.map(t => [t.id, t]))
  if (byId.size !== tickets.length) throw new Error('Duplicate ticket identities in discovery')
  const delivered = new Set(tasks.filter(t => t.status === 'merged' && t.closedAt).map(t => t.ticket.id))
  const satisfied = (t: Ticket): boolean => delivered.has(t.id) || (t.state === 'closed' && t.merged)
  const current = milestones.find(m => tickets.some(t => t.milestone === m && !satisfied(t)))
  const dependencyIssue = (ticket: Ticket, path: Set<string>): string | undefined => {
    if (path.has(ticket.id)) return `Dependency cycle involving ${ticket.id}`
    const next = new Set(path).add(ticket.id)
    for (const id of ticket.predecessors) {
      const predecessor = byId.get(id)
      if (!predecessor) return `Missing predecessor ${id}`
      if (satisfied(predecessor)) continue
      const cycle = dependencyIssue(predecessor, next)
      if (cycle) return cycle
      if (milestones.indexOf(predecessor.milestone) > milestones.indexOf(ticket.milestone)) return `Predecessor ${id} belongs to a later milestone`
      return `Waiting for predecessor ${id} to be merged and closed`
    }
    return undefined
  }
  return tickets.map(t => {
    const reason = satisfied(t) ? 'Delivered' : !milestones.includes(t.milestone) ? 'Outside configured milestones'
      : tasks.some(task => task.ticket.id === t.id) ? 'Already claimed; see task status'
      : t.exclusion ? t.exclusion
      : t.state === 'closed' ? 'Closed without verified merged delivery'
      : dependencyIssue(t, new Set())
      ?? (t.milestone !== current ? `Waiting for milestone ${current ?? '(none)'}` : '')
    return { ticketId: t.id, eligible: !reason, reason: reason || 'Ready' }
  })
}

/** Wall-clock phase intervals partition time; never sum parallel agent effort into these. */
export function phaseDurations(task: Pick<Task, 'phases' | 'finishedAt'>, now = Date.now()): Record<string, number> {
  const result: Record<string, number> = {}
  task.phases.forEach((event, i) => {
    const end = task.phases[i + 1]?.at ?? task.finishedAt
    const ms = Math.max(0, (end ? Date.parse(end) : now) - Date.parse(event.at))
    result[event.phase] = (result[event.phase] ?? 0) + ms
  })
  return result
}

/** Validate the UI/command payload without admitting arbitrary configuration fields. */
export function validateConfig(raw: unknown): RunConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Run configuration must be an object')
  const c = raw as Record<string, unknown>
  if (!Array.isArray(c.milestones) || c.milestones.length === 0 || c.milestones.some(x => typeof x !== 'string' || !x.trim()) || new Set(c.milestones).size !== c.milestones.length) throw new Error('Provide distinct ordered milestone names')
  const str = (key: string, fallback?: string): string => {
    const value = c[key] ?? fallback
    if (typeof value !== 'string' || !value.trim() || value.includes('\0')) throw new Error(`Invalid ${key}`)
    return value.trim()
  }
  const integer = (key: string, fallback: number, min: number, max: number): number => {
    const value = c[key] ?? fallback
    if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) throw new Error(`${key} must be ${min}–${max}`)
    return value
  }
  if (c.provider !== 'github' && c.provider !== 'azure') throw new Error('Choose github or azure mode')
  const workspace = str('workspace')
  if (!isAbsolute(workspace)) throw new Error('Workspace must be an absolute repository path')
  const remote = str('remote', 'origin'), targetBranch = str('targetBranch', 'main')
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(remote) || targetBranch.startsWith('-') || targetBranch.includes('..') || /[\s~^:?*\[\\]/.test(targetBranch)) throw new Error('Invalid remote or target branch')
  if (!Array.isArray(c.verifyCommands) || c.verifyCommands.length === 0 || c.verifyCommands.some(x => typeof x !== 'string' || !x.trim())) throw new Error('Provide at least one verification command')
  const optional = (key: string): string | undefined => c[key] === undefined || c[key] === '' ? undefined : str(key)
  const bool = (key: string, fallback: boolean): boolean => {
    if (c[key] !== undefined && typeof c[key] !== 'boolean') throw new Error(`Invalid ${key}`)
    return c[key] as boolean | undefined ?? fallback
  }
  const result: RunConfig = { provider: c.provider, repository: str('repository'), workspace, remote, targetBranch,
    milestones: c.milestones as string[], parallelism: integer('parallelism', 2, 1, 32), maxTeamMembers: integer('maxTeamMembers', 3, 1, 16),
    pollSeconds: integer('pollSeconds', 30, 5, 3600), maxRepairRounds: integer('maxRepairRounds', 3, 0, 20), maxTaskMinutes: integer('maxTaskMinutes', 120, 1, 1440),
    verifyCommands: c.verifyCommands as string[], workerPreset: str('workerPreset', 'standard'), requireBrowser: bool('requireBrowser', false), requireMemory: bool('requireMemory', true),
    ...optional('organization') ? { organization: optional('organization') } : {}, ...optional('project') ? { project: optional('project') } : {}, ...optional('query') ? { query: optional('query') } : {} }
  if (result.provider === 'azure' && (!result.organization || !result.project)) throw new Error('Azure mode needs organization URL and project')
  return result
}
