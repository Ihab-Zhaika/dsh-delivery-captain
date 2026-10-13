import { createHash, randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
export function backlogFingerprint(run) {
    return createHash('sha256').update(JSON.stringify({ schedulerFailure: (run.schedulerFailures?.count ?? 0) >= 3 ? run.schedulerFailures?.message : undefined, tasks: run.tasks.filter(t => ['blocked', 'parked'].includes(t.status)).map(t => ({ id: t.id, status: t.status, reason: t.error ?? t.parkReason, head: t.headSha, decision: t.waitingDecision })).sort((a, b) => a.id.localeCompare(b.id)) })).digest('hex');
}
export function needsBacklogRecovery(run) {
    return run.tasks.filter(t => t.status === 'parked').length > (run.config.parkedRecoveryThreshold ?? 4) || (run.schedulerFailures?.count ?? 0) >= 3;
}
export function backlogRecoveryReason(run) {
    const parked = run.tasks.filter(t => t.status === 'parked').length, threshold = run.config.parkedRecoveryThreshold ?? 4;
    return parked > threshold ? `${parked} parked tickets exceed ${threshold}; prioritize shared-cause recovery before new intake` : `${run.schedulerFailures?.count ?? 0} consecutive scheduler failures; diagnose ${run.schedulerFailures?.message ?? 'runtime failure'} before new intake`;
}
export function recoveryTask(run, repositoryKey) {
    const id = randomUUID(), at = new Date().toISOString(), repoHash = createHash('sha256').update(repositoryKey).digest('hex').slice(0, 12);
    return { kind: 'recovery', id, attempt: randomUUID(), sessionId: randomUUID(), assignmentConfig: structuredClone(run.config), branch: `codex/recovery-${id.slice(0, 8)}`, worktree: join(dirname(run.config.workspace), '.delivery-worktrees', repoHash, id), baseSha: '', status: 'starting', phase: 'setup', phases: [{ phase: 'setup', at }], startedAt: at, reviewRounds: 0, followups: [], ticket: { id: 'recovery', title: 'DarKingDoom shared backlog recovery', body: 'Find and repair shared causes that hold existing delivery assignments. No tracker issue is required. Preserve existing work and all final gates; do not create new ticket roots or expand product scope.', url: '', milestone: '', predecessors: [], state: 'open', merged: false, priority: 0, createdAt: at, labels: [] } };
}
export function recoveryFacts(run) {
    return JSON.stringify({ runId: run.id, coordinatorSessionId: run.captainSessionId, intakeMode: run.intakeMode ?? 'new-tickets', threshold: run.config.parkedRecoveryThreshold ?? 4, hold: run.backlogHold, tasks: run.tasks.filter(t => !['merged', 'cancelled'].includes(t.status)).map(t => ({ taskId: t.id, ticket: t.ticket.id, sessionId: t.sessionId, worktree: t.worktree, status: t.status, phase: t.phase, reason: (t.error ?? t.parkReason ?? '').slice(0, 1800), decision: t.waitingDecision?.slice(0, 1200), predecessors: t.ticket.predecessors, head: t.headSha, pr: t.prUrl })) }, null, 2);
}
