import { access, appendFile, mkdir, readFile, realpath } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { CommandRunner, RunConfig, Task } from './types.ts'

export async function resolveHead(task: Task, run: CommandRunner): Promise<string> {
  const head = (await run('git', ['rev-parse', '--verify', 'HEAD'], { cwd: task.worktree })).trim()
  if (!/^[a-f0-9]{40,64}$/.test(head)) throw new Error('Invalid worktree HEAD')
  return head
}

export async function fetchTarget(config: RunConfig, run: CommandRunner, cwd = config.workspace): Promise<string> {
  if (!config.remote || config.remote.startsWith('-') || /[\r\n\0]/.test(config.remote)) throw new Error('Invalid remote')
  await run('git', ['check-ref-format', `refs/heads/${config.targetBranch}`], { cwd })
  await run('git', ['fetch', '--no-tags', config.remote, `+refs/heads/${config.targetBranch}:refs/remotes/${config.remote}/${config.targetBranch}`], { cwd, timeoutMs: 120_000 })
  return (await run('git', ['rev-parse', '--verify', `refs/remotes/${config.remote}/${config.targetBranch}^{commit}`], { cwd })).trim()
}

/** Adopt only the exact registered branch/path. Never reset existing work. */
export async function prepareWorktree(task: Task, config: RunConfig, run: CommandRunner, teamStateDir = '.agent-teams'): Promise<void> {
  const target = await fetchTarget(config, run)
  await run('git', ['check-ref-format', `refs/heads/${task.branch}`], { cwd: config.workspace })
  if (!/^\.?[a-zA-Z0-9_-]+$/.test(teamStateDir)) throw new Error('AgentTeams stateDir must be a single workspace directory name')
  const common = resolve(config.workspace, (await run('git', ['rev-parse', '--git-common-dir'], { cwd: config.workspace })).trim())
  const exclude = resolve(common, 'info', 'exclude')
  let text = ''
  try { text = await readFile(exclude, 'utf8') } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  if (!text.split(/\r?\n/).includes(`/${teamStateDir}/`)) {
    await mkdir(resolve(common, 'info'), { recursive: true })
    await appendFile(exclude, `\n# DarKingDoom Plugin: original AgentTeams runtime state\n/${teamStateDir}/\n`)
  }
  const expected = resolve(task.worktree)
  const listed = await run('git', ['worktree', 'list', '--porcelain', '-z'], { cwd: config.workspace })
  const records = listed.split('\0\0').map(record => record.split('\0'))
  const samePath = (path: string) => process.platform === 'win32' ? resolve(path).toLowerCase() === expected.toLowerCase() : resolve(path) === expected
  const record = records.find(fields => fields.some(field => field.startsWith('worktree ') && samePath(field.slice(9))))
  if (record) {
    if (!record.includes(`branch refs/heads/${task.branch}`)) throw new Error('Existing worktree is on an unexpected branch')
    if (await realpath(expected) !== await realpath((await run('git', ['rev-parse', '--show-toplevel'], { cwd: expected })).trim())) throw new Error('Unexpected worktree root')
    if (task.baseSha) await run('git', ['merge-base', '--is-ancestor', task.baseSha, 'HEAD'], { cwd: expected })
    else task.baseSha = (await run('git', ['merge-base', target, 'HEAD'], { cwd: expected })).trim()
    return
  }
  let exists = true
  try { await access(expected) } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') exists = false; else throw error }
  if (exists) throw new Error('Refusing to adopt an unregistered worktree path')
  if (records.some(fields => fields.includes(`branch refs/heads/${task.branch}`))) throw new Error('Task branch already belongs to another worktree')
  await run('git', ['worktree', 'add', '-b', task.branch, expected, target], { cwd: config.workspace })
  task.baseSha = target
}
