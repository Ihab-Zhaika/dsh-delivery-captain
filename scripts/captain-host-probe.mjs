/** Optional isolated-host probe. Mount with --patch; never prompts a model or reads a backlog. */
import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createRuntime, configureFullAccess } from '../lib/captain/runtime.js'

export const name = 'captain-contract-probe'
export const inject = ['sessionController', 'agents', 'subagents', 'tools']
export async function apply(ctx) {
  const workspace = process.env.CAPTAIN_PROBE_WORKSPACE
  const output = process.env.CAPTAIN_PROBE_OUTPUT ?? (process.env.DSH_HOME && join(process.env.DSH_HOME, 'captain-probe.json'))
  if (!workspace || !output) throw new Error('Set CAPTAIN_PROBE_WORKSPACE and CAPTAIN_PROBE_OUTPUT in an isolated test profile')
  try {
    for (let n = 0; !ctx.tools.get('agent_teams_create') && n < 100; n++) await new Promise(resolve => setTimeout(resolve, 100))
    const captainSessionId = randomUUID(), workerId = randomUUID()
    await ctx.sessionController.create({ sessionId: captainSessionId, cwd: workspace, agentPreset: 'standard' })
    await configureFullAccess(ctx, captainSessionId)
    const config = { workspace, workerPreset: 'standard', maxTeamMembers: 2, requireMemory: false, requireBrowser: false }
    const task = { id: 'probe', sessionId: workerId, worktree: workspace, ticket: { id: 'probe', title: 'Contract probe', body: 'No execution', milestone: 'M1', predecessors: [] } }
    const runtime = createRuntime(ctx)
    await runtime.restore(task, { captainSessionId, config })
    const agent = ctx.agents.get(workerId)
    const kinds = ['permission/preset', 'sandbox/mode', 'approval/policy']
    const events = agent.session.snapshotEvents().filter(event => kinds.includes(event.type)).map(event => ({ type: event.type, data: event.data }))
    const tools = ['agent_teams_create', 'agent_teams_add_member', 'agent_teams_create_task', 'agent_teams_delete'].map(name => ({ name, available: !!ctx.tools.get(name, agent) }))
    const latest = Object.fromEntries(events.map(event => [event.type, event.data]))
    const success = !agent.session.header.parentSession && agent.status === 'idle' && tools.every(tool => tool.available) && latest['permission/preset']?.preset === 'danger-full-access' && latest['approval/policy']?.policy === 'never' && latest['sandbox/mode']?.mode === 'danger-full-access'
    await writeFile(output, JSON.stringify({ success, workerRoot: !agent.session.header.parentSession, status: agent.status, tools, permissions: events }, null, 2))
    await runtime.stop(workerId)
  } catch (error) { await writeFile(output, JSON.stringify({ success: false, error: String(error) }, null, 2)) }
}
