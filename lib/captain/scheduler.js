import { isAbsolute } from 'node:path';
function dependencyContext(tickets, tasks) {
    const byId = new Map(tickets.map(t => [t.id, t]));
    if (byId.size !== tickets.length)
        throw new Error('Duplicate ticket identities in discovery');
    const delivered = new Set(tasks.filter(t => t.status === 'merged' && t.closedAt).map(t => t.ticket.id));
    const satisfied = (t) => delivered.has(t.id) || (t.state === 'closed' && (t.merged || t.completedDecision === true));
    const dependencyIssue = (ticket, path) => {
        if (path.has(ticket.id))
            return `Dependency cycle involving ${ticket.id}`;
        const next = new Set(path).add(ticket.id);
        for (const id of ticket.predecessors) {
            const predecessor = byId.get(id);
            if (!predecessor)
                return `Missing predecessor ${id}`;
            if (satisfied(predecessor))
                continue;
            const cycle = dependencyIssue(predecessor, next);
            if (cycle)
                return cycle;
            return `Waiting for predecessor ${id} to be merged and closed`;
        }
        return undefined;
    };
    return { satisfied, dependencyIssue };
}
/** Fresh remote proofs can use this without applying intake filters or existing-task exclusion. */
export function dependencyBlocker(ticket, tickets, tasks = []) {
    return dependencyContext(tickets, tasks).dependencyIssue(ticket, new Set());
}
/** Resolve the complete predecessor closure; related links never enter this graph. */
export function eligibility(tickets, milestones, tasks, policy = {}) {
    const { satisfied, dependencyIssue } = dependencyContext(tickets, tasks);
    const delivered = new Set(tasks.filter(t => t.status === 'merged' && t.closedAt).map(t => t.ticket.id));
    const byId = new Map(tickets.map(t => [t.id, t]));
    const selected = (t) => milestones.includes(t.milestone) || policy.includeUnmilestoned === true && !t.milestone;
    const permitted = (t) => !policy.ticketIds || policy.ticketIds.includes(t.id);
    const rank = (t) => { const index = milestones.indexOf(t.milestone); return index < 0 ? milestones.length : index; };
    const requiredBy = new Map();
    if (policy.includeRequiredPredecessors) {
        for (const root of tickets.filter(t => t.state === 'open' && !satisfied(t) && !t.exclusion && permitted(t) && selected(t) && (!t.selectionExclusion || tasks.some(task => task.ticket.id === t.id && !['merged', 'failed', 'cancelled'].includes(task.status))))) {
            const seen = new Set([root.id]);
            const visit = (ticket) => {
                for (const id of ticket.predecessors) {
                    if (seen.has(id))
                        continue;
                    seen.add(id);
                    const parent = byId.get(id);
                    if (!parent || satisfied(parent) || parent.exclusion || !permitted(parent))
                        continue;
                    const roots = requiredBy.get(id) ?? new Set();
                    roots.add(root.id);
                    requiredBy.set(id, roots);
                    visit(parent);
                }
            };
            visit(root);
        }
    }
    return tickets.map(t => {
        const task = tasks.find(task => task.ticket.id === t.id), requiredFor = [...requiredBy.get(t.id) ?? []].sort();
        const scope = requiredFor.length ? 'predecessor' : milestones.includes(t.milestone) ? 'milestone' : policy.includeUnmilestoned && !t.milestone ? 'unmilestoned' : undefined;
        const milestoneRank = requiredFor.length ? Math.min(selected(t) ? rank(t) : milestones.length, ...requiredFor.map(id => rank(byId.get(id)))) : rank(t);
        const priority = Math.min(t.priority, ...requiredFor.map(id => byId.get(id).priority));
        const reason = satisfied(t) ? t.completedDecision && !t.merged && !delivered.has(t.id) ? 'Decision completed (no code merge claimed)' : 'Delivered'
            : task ? `Task ${task.status}${task.error ? `: ${task.error}` : '; see task status'}`
                : !permitted(t) ? 'Outside configured ticket selection'
                    : t.exclusion ? t.exclusion
                        : !scope ? 'Outside configured intake scope'
                            : t.selectionExclusion && !requiredFor.length ? t.selectionExclusion
                                : t.state === 'closed' ? 'Closed without verified merged delivery'
                                    : dependencyIssue(t, new Set())
                                        ?? '';
        const state = satisfied(t) ? t.completedDecision && !t.merged && !delivered.has(t.id) ? 'decision-complete' : 'delivered'
            : task ? task.status : !permitted(t) || t.exclusion || !scope || t.selectionExclusion && !requiredFor.length ? 'excluded' : t.state === 'closed' ? 'unverified-closure'
                : reason ? 'dependency' : 'eligible';
        return { ticketId: t.id, eligible: !reason, reason: reason || (requiredFor.length ? `Required predecessor for ${requiredFor.map(id => '#' + id).join(', ')}` : 'Ready'), state, predecessors: t.predecessors, scope, requiredFor, milestoneRank, priority };
    });
}
/** Parked human waiting is visible wall time but does not spend the task's execution budget. */
export function taskDeadline(task, minutes, now = Date.now()) {
    const start = Date.parse(task.budgetStartedAt ?? task.startedAt);
    let parked = 0;
    task.phases.forEach((event, i) => {
        if (event.phase !== 'parked')
            return;
        const end = task.phases[i + 1]?.at ?? task.finishedAt;
        parked += Math.max(0, (end ? Date.parse(end) : now) - Math.max(start, Date.parse(event.at)));
    });
    return start + minutes * 60000 + parked;
}
/** Wall-clock phase intervals partition time; never sum parallel agent effort into these. */
export function phaseDurations(task, now = Date.now()) {
    const result = {};
    task.phases.forEach((event, i) => {
        const end = task.phases[i + 1]?.at ?? task.finishedAt;
        const ms = Math.max(0, (end ? Date.parse(end) : now) - Date.parse(event.at));
        result[event.phase] = (result[event.phase] ?? 0) + ms;
    });
    return result;
}
/** Validate the UI/command payload without admitting arbitrary configuration fields. */
export function validateConfig(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        throw new Error('Run configuration must be an object');
    const c = raw;
    if (!Array.isArray(c.milestones) || c.milestones.length === 0 && c.includeUnmilestoned !== true || c.milestones.some(x => typeof x !== 'string' || !x.trim()) || new Set(c.milestones).size !== c.milestones.length)
        throw new Error('Provide distinct ordered milestone names');
    const str = (key, fallback) => {
        const value = c[key] ?? fallback;
        if (typeof value !== 'string' || !value.trim() || value.includes('\0'))
            throw new Error(`Invalid ${key}`);
        return value.trim();
    };
    const integer = (key, fallback, min, max) => {
        const value = c[key] ?? fallback;
        if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max)
            throw new Error(`${key} must be ${min}–${max}`);
        return value;
    };
    if (c.provider !== 'github' && c.provider !== 'azure')
        throw new Error('Choose github or azure mode');
    const workspace = str('workspace');
    if (!isAbsolute(workspace))
        throw new Error('Workspace must be an absolute repository path');
    const remote = str('remote', 'origin'), targetBranch = str('targetBranch', 'main');
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(remote) || targetBranch.startsWith('-') || targetBranch.includes('..') || /[\s~^:?*\[\\]/.test(targetBranch))
        throw new Error('Invalid remote or target branch');
    if (!Array.isArray(c.verifyCommands) || c.verifyCommands.length === 0 || c.verifyCommands.some(x => typeof x !== 'string' || !x.trim()))
        throw new Error('Provide at least one verification command');
    const optional = (key) => c[key] === undefined || c[key] === '' ? undefined : str(key);
    const bool = (key, fallback) => {
        if (c[key] !== undefined && typeof c[key] !== 'boolean')
            throw new Error(`Invalid ${key}`);
        return c[key] ?? fallback;
    };
    const result = { provider: c.provider, repository: str('repository'), workspace, remote, targetBranch,
        milestones: c.milestones, includeUnmilestoned: bool('includeUnmilestoned', false), includeRequiredPredecessors: bool('includeRequiredPredecessors', false), ocrMaxTokensBudget: integer('ocrMaxTokensBudget', 1_000_000, 1, 10_000_000), parallelism: integer('parallelism', 2, 1, 32), maxTeamMembers: integer('maxTeamMembers', 3, 1, 16),
        pollSeconds: integer('pollSeconds', 30, 5, 3600), maxRepairRounds: integer('maxRepairRounds', 3, 0, 20), maxTaskMinutes: integer('maxTaskMinutes', 120, 1, 1440),
        maxTickets: integer('maxTickets', 0, 0, 100000),
        verifyCommands: c.verifyCommands, workerPreset: str('workerPreset', 'standard'), requireBrowser: bool('requireBrowser', false), requireMemory: bool('requireMemory', true),
        ...optional('organization') ? { organization: optional('organization') } : {}, ...optional('project') ? { project: optional('project') } : {}, ...optional('query') ? { query: optional('query') } : {} };
    if (c.ticketIds !== undefined) {
        if (!Array.isArray(c.ticketIds) || !c.ticketIds.length || c.ticketIds.some(id => typeof id !== 'string' || !/^[1-9][0-9]*$/.test(id)) || new Set(c.ticketIds).size !== c.ticketIds.length)
            throw new Error('ticketIds must be distinct positive ticket IDs');
        result.ticketIds = c.ticketIds;
    }
    if (c.verifyCommandsByTicket !== undefined) {
        if (!c.verifyCommandsByTicket || typeof c.verifyCommandsByTicket !== 'object' || Array.isArray(c.verifyCommandsByTicket))
            throw new Error('Invalid per-ticket verification commands');
        const entries = Object.entries(c.verifyCommandsByTicket);
        if (entries.some(([id, commands]) => !/^[1-9][0-9]*$/.test(id) || !Array.isArray(commands) || !commands.length || commands.some(cmd => typeof cmd !== 'string' || !cmd.trim())))
            throw new Error('Per-ticket verification requires valid ticket IDs and nonempty command arrays');
        result.verifyCommandsByTicket = Object.fromEntries(entries);
    }
    if (result.provider === 'azure' && (!result.organization || !result.project))
        throw new Error('Azure mode needs organization URL and project');
    return result;
}
export function taskConfig(config, ticketId) {
    const commands = config.verifyCommandsByTicket?.[ticketId];
    return commands ? { ...config, verifyCommands: commands } : config;
}
export function taskDeliveryConfig(task, config) {
    return taskConfig(task.assignmentConfig ?? config, task.ticket.id);
}
