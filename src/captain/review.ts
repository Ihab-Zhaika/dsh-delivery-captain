import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CommandRunner, Phase, ReviewResult, RunConfig, Task } from './types.ts'
import { fetchTarget, resolveHead } from './worktrees.ts'

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed OCR report object')
  return value as Record<string, unknown>
}
function rows(value: unknown): Record<string, unknown>[] {
  // Go's nil slices are encoded as null; the contract treats them as empty sets.
  if (value === null) return []
  if (!Array.isArray(value)) throw new Error('Missing OCR coverage array')
  return value.map(object)
}

/** OCR's versioned manifest is authoritative; exit zero alone may mean partial coverage. */
export function parseOcrReport(text: string, head: string, base: string, changedPaths: string[]): string[] {
  const report = object(JSON.parse(text)); const manifest = object(report.manifest)
  if (report.status !== 'complete' || manifest.schema_version !== 'ocr.run-manifest/v1' || manifest.operation !== 'review' || manifest.terminal_state !== 'complete' || manifest.run_failure) throw new Error('OCR review is incomplete or uses an unsupported manifest')
  const input = object(manifest.input)
  if (input.mode !== 'range' || input.resolved_head !== head || input.resolved_base !== base) throw new Error('OCR reviewed a different commit range')
  const coverage = object(manifest.coverage)
  if (rows(coverage.failed).length || rows(coverage.waived).length) throw new Error('OCR coverage contains failed or waived files')
  const selected = rows(coverage.selected); const completed = [...rows(coverage.completed), ...rows(coverage.reused)]
  const ids = new Set<string>(); const paths = new Set<string>()
  for (const row of selected) {
    if (typeof row.item_id !== 'string' || typeof row.path !== 'string' || ids.has(row.item_id)) throw new Error('Malformed OCR selected coverage')
    ids.add(row.item_id); paths.add(row.path)
    if (typeof row.old_path === 'string' && row.old_path) paths.add(row.old_path)
  }
  const done = new Set<string>()
  for (const row of completed) {
    if (typeof row.item_id !== 'string' || !ids.has(row.item_id) || done.has(row.item_id) || !selected.some(item => item.item_id === row.item_id && item.path === row.path)) throw new Error('Malformed OCR completed coverage')
    done.add(row.item_id)
  }
  if (!selected.length || done.size !== ids.size || changedPaths.some(path => !paths.has(path)) || paths.size !== new Set(changedPaths).size) throw new Error('OCR did not cover every changed path')
  if (report.summary && object(report.summary).budget_exceeded) throw new Error('OCR review exceeded its budget')
  const findings: string[] = []
  for (const comment of rows(report.comments)) {
    if (typeof comment.path !== 'string' || typeof comment.content !== 'string' || !['critical', 'high', 'medium', 'low'].includes(String(comment.severity))) throw new Error('Malformed OCR finding')
    if (comment.severity !== 'low') findings.push(`[${comment.severity}] ${comment.path}:${comment.start_line ?? 0} ${comment.content}`)
  }
  return findings
}

export async function reviewTask(task: Task, config: RunConfig, run: CommandRunner, onPhase?: (phase: Phase) => Promise<void>, signal?: AbortSignal): Promise<ReviewResult> {
  let headSha = ''; let baseSha: string | undefined; let report = ''; const findings: string[] = []
  const directory = await mkdtemp(join(tmpdir(), 'darkingdoom-review-'))
  const timeoutMs = Math.max(1, config.maxTaskMinutes) * 60_000
  const started = Date.parse(task.startedAt)
  const deadline = Number.isFinite(started) ? started + timeoutMs : Date.now()
  const remaining = () => { signal?.throwIfAborted(); const ms = deadline - Date.now(); if (ms <= 0) throw new Error('Review timed out'); return ms }
  const bounded: CommandRunner = (file, args, options) => run(file, args, { ...options, signal, timeoutMs: Math.min(options?.timeoutMs ?? Infinity, remaining()) })
  const unchanged = async () => {
    if (await resolveHead(task, bounded) !== headSha) throw new Error('Worktree HEAD changed during review')
    if ((await bounded('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: task.worktree })).trim()) throw new Error('Worktree contains uncommitted changes')
  }
  try {
    headSha = await resolveHead(task, bounded)
    await unchanged()
    const target = await fetchTarget(config, bounded, task.worktree)
    baseSha = target
    await bounded('git', ['merge-base', '--is-ancestor', target, headSha], { cwd: task.worktree })
    if (target === headSha) throw new Error('No implementation commit to review')
    await onPhase?.('testing')
    for (const command of config.verifyCommands) {
      await unchanged()
      const shell = process.platform === 'win32' ? 'powershell.exe' : '/bin/sh'
      const args = process.platform === 'win32' ? ['-NoProfile', '-NonInteractive', '-Command', `$ErrorActionPreference = 'Stop'\n${command}\nif ($LASTEXITCODE) { exit $LASTEXITCODE }`] : ['-c', command]
      await bounded(shell, args, { cwd: task.worktree })
      await unchanged()
    }
    const paths = (await bounded('git', ['diff', '--no-renames', '--name-only', '-z', target, headSha], { cwd: task.worktree })).split('\0').filter(Boolean)
    const output = join(directory, 'review.json')
    await unchanged()
    await onPhase?.('review')
    await bounded('ocr', ['review', '--audience', 'agent', '--from', target, '--to', headSha, '--format', 'json', '--output', output, '--background', `${task.ticket.title}\n${task.ticket.body}`, '--timeout', String(Math.max(1, Math.ceil(remaining() / 60_000)))], { cwd: task.worktree })
    report = await readFile(output, 'utf8')
    findings.push(...parseOcrReport(report, headSha, target, paths))
    await unchanged()
    if (await fetchTarget(config, bounded, task.worktree) !== target) throw new Error('Target branch moved during review; integrate current target and repeat checks')
    await unchanged()
    return { passed: findings.length === 0, headSha, baseSha, report, findings }
  } catch (error) {
    findings.push(error instanceof Error ? error.message : String(error))
    return { passed: false, headSha, baseSha, report: report || findings.join('\n'), findings }
  } finally { await rm(directory, { recursive: true, force: true }) }
}

/** Cheap cache validation; a cached pass is evidence for one exact clean range only. */
export async function isReviewCurrent(task: Task, config: RunConfig, review: ReviewResult, run: CommandRunner, signal?: AbortSignal): Promise<boolean> {
  if (!review.passed || review.findings.length || !review.baseSha || !/^[a-f0-9]{40,64}$/.test(review.baseSha) || !/^[a-f0-9]{40,64}$/.test(review.headSha)) return false
  const deadline = Date.parse(task.startedAt) + Math.max(1, config.maxTaskMinutes) * 60_000
  const bounded: CommandRunner = (file, args, options) => {
    signal?.throwIfAborted()
    const remaining = deadline - Date.now()
    if (!Number.isFinite(remaining) || remaining <= 0) throw new Error('Task time budget exhausted')
    return run(file, args, { ...options, signal, timeoutMs: Math.min(remaining, options?.timeoutMs ?? 120_000) })
  }
  try {
    if (await resolveHead(task, bounded) !== review.headSha) return false
    if (await fetchTarget(config, bounded, task.worktree) !== review.baseSha) return false
    if ((await bounded('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: task.worktree })).trim()) return false
    return await resolveHead(task, bounded) === review.headSha
  } catch { return false }
}
