import { mkdtemp, readFile, rm,writeFile } from 'node:fs/promises'
import {createHash} from 'node:crypto'
import type {AgentReviewInput} from './agent-review.ts'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CommandRunner, Phase, ReviewResult, RunConfig, Task } from './types.ts'
import { fetchTarget, resolveHead } from './worktrees.ts'
import { taskDeadline } from './scheduler.ts'

export function ocrTokensBudget(config: RunConfig): number {
  const budget = config.ocrMaxTokensBudget ?? 1_000_000
  if (!Number.isSafeInteger(budget) || budget <= 0 || budget > 10_000_000) throw new Error('OCR token budget must be a positive safe integer between 1 and 10000000')
  return budget
}

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed OCR report object')
  return value as Record<string, unknown>
}
export function reviewPolicyStamp(config:RunConfig):string{return JSON.stringify([config.reviewBackend??'ocr',config.ocrAdditionalCheck??false,ocrTokensBudget(config)])}
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

export type IndependentReviewRunner=(input:AgentReviewInput,signal:AbortSignal)=>Promise<{report:string;findings:string[];reviewerSessionId:string}>
export async function reviewTask(task: Task, config: RunConfig, run: CommandRunner, onPhase?: (phase: Phase) => Promise<void>, signal?: AbortSignal,agentReview?:IndependentReviewRunner): Promise<ReviewResult> {
  let headSha = ''; let baseSha: string | undefined; let report = ''; const findings: string[] = []
  const directory = await mkdtemp(join(tmpdir(), 'darkingdoom-review-'))
  const timeoutMs = Math.max(1, config.maxTaskMinutes) * 60_000
  const started = Date.parse(task.startedAt)
  const deadline = Number.isFinite(started) ? taskDeadline({...task,phases:task.phases??[]},config.maxTaskMinutes) : Date.now()
  const remaining = () => { signal?.throwIfAborted(); const ms = deadline - Date.now(); if (ms <= 0) throw new Error('Review timed out'); return ms }
  const backend=config.reviewBackend??'ocr';let reviewerSessionId:string|undefined
  const bounded: CommandRunner = (file, args, options) => run(file, args, { ...options, signal, timeoutMs: Math.min(options?.timeoutMs ?? Infinity, remaining()) })
  const unchanged = async () => {
    if (await resolveHead(task, bounded) !== headSha) throw new Error('Worktree HEAD changed during review')
    if ((await bounded('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: task.worktree })).trim()) throw new Error('Worktree contains uncommitted changes')
  }
  try {
    const tokensBudget = ocrTokensBudget(config)
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
    const paths = (await bounded('git', ['diff', '--no-ext-diff','--no-textconv','--no-renames', '--name-only', '-z', target, headSha], { cwd: task.worktree })).split('\0').filter(Boolean)
    const output = join(directory, 'review.json')
    await unchanged()
    await onPhase?.('review')
    const ocr=async()=>{await bounded('ocr', ['review', '--audience', 'agent', '--from', target, '--to', headSha, '--format', 'json', '--output', output, '--background', `${task.ticket.title}\n${task.ticket.body}`, '--max-tokens-budget', String(tokensBudget), '--concurrency','1','--timeout', String(Math.max(1, Math.ceil(remaining() / 60_000)))], { cwd: task.worktree });const text=await readFile(output,'utf8');return {text,findings:parseOcrReport(text,headSha,target,paths)}}
    if(backend==='agent'){
      if(!agentReview)throw new Error('Independent agent review adapter is unavailable; cannot substitute a manual pass')
      const treeSha=(await bounded('git',['rev-parse',`${headSha}^{tree}`],{cwd:task.worktree})).trim(),snapshots:AgentReviewInput['paths']=[]
      for(const [index,path] of paths.entries()){
        const diff=await bounded('git',['--literal-pathspecs','diff','--no-ext-diff','--no-textconv','--no-renames','--binary','--unified=80',target,headSha,'--',path],{cwd:task.worktree})
        const content=`Immutable independent review snapshot\n${JSON.stringify({path,baseSha:target,headSha,treeSha,worktree:task.worktree})}\n\nInspect every changed hunk and its surrounding context, and read relevant current source in the given worktree if needed. Binary/opaque changes require actual review evidence, never a waived path.\n\n${diff}`
        const snapshotPath=join(directory,`path-${index}.txt`);await writeFile(snapshotPath,content,'utf8');snapshots.push({path,snapshotPath,fingerprint:createHash('sha256').update(content).digest('hex')})
      }
      const result=await agentReview({baseSha:target,headSha,treeSha,worktree:task.worktree,businessContext:`${task.ticket.title}\n${task.ticket.body}`,maxTokensBudget:tokensBudget,timeoutMs:Math.ceil(remaining()),paths:snapshots},signal??new AbortController().signal)
      report=result.report;reviewerSessionId=result.reviewerSessionId;findings.push(...result.findings)
      if(config.ocrAdditionalCheck){let supplemental:unknown;try{const extra=await ocr();findings.push(...extra.findings);supplemental={status:'complete',report:extra.text}}catch(error){supplemental={status:'incomplete',reason:String(error)}};report=JSON.stringify({primary:JSON.parse(report),optionalOcr:supplemental})}
    }else{const result=await ocr();report=result.text;findings.push(...result.findings)}
    await unchanged()
    if (await fetchTarget(config, bounded, task.worktree) !== target) throw new Error('Target branch moved during review; integrate current target and repeat checks')
    await unchanged()
    return { passed: findings.length === 0, headSha, baseSha, report, findings,backend,policyStamp:reviewPolicyStamp(config),...reviewerSessionId?{reviewerSessionId}:{}, ...(findings.length?{failureKind:'findings' as const}:{}) }
  } catch (error) {
    findings.push(error instanceof Error ? error.message : String(error))
    return { passed: false, headSha, baseSha, report: report || findings.join('\n'), findings,backend, failureKind:'infrastructure' }
  } finally { await rm(directory, { recursive: true, force: true }) }
}

/** Cheap cache validation; a cached pass is evidence for one exact clean range only. */
export async function isReviewCurrent(task: Task, config: RunConfig, review: ReviewResult, run: CommandRunner, signal?: AbortSignal): Promise<boolean> {
  if((review.backend??'ocr')!==(config.reviewBackend??'ocr'))return false
  if(review.policyStamp!==reviewPolicyStamp(config))return false
  if (!review.passed || review.findings.length || !review.baseSha || !/^[a-f0-9]{40,64}$/.test(review.baseSha) || !/^[a-f0-9]{40,64}$/.test(review.headSha)) return false
  const deadline = taskDeadline({...task,phases:task.phases??[]},Math.max(1,config.maxTaskMinutes))
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
