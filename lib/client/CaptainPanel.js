import { jsxs as _jsxs, jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
/** Native sidebar content. Mounting never enables automation or captures chat focus. */
import { useCallback, useEffect, useRef, useState, useId } from 'react';
import css from './CaptainPanel.module.css';
const MAX_OCR_TOKENS_BUDGET = 10_000_000;
function validReviewBudget(value) {
    return Number.isSafeInteger(value) && value >= 1 && value <= MAX_OCR_TOKENS_BUDGET;
}
function intakePolicy(config) {
    return { includeUnmilestoned: config.includeUnmilestoned ?? false, includeRequiredPredecessors: config.includeRequiredPredecessors ?? false, ocrMaxTokensBudget: config.ocrMaxTokensBudget ?? 1_000_000, reviewBackend: config.reviewBackend ?? 'ocr', ocrAdditionalCheck: config.ocrAdditionalCheck ?? false };
}
function scopeLabel(row) {
    if (row?.scope === 'predecessor')
        return row.requiredFor?.length ? `Required by ${row.requiredFor.map(id => `#${id}`).join(', ')}` : 'Required predecessor';
    return row?.scope === 'unmilestoned' ? 'Included without a milestone' : '';
}
/** A stopped run retains its identity and claims; only Resume reactivates it. */
export function captainActionAvailability(status, loaded, busy) {
    const available = loaded && !busy;
    const active = status !== undefined && status !== 'stopped';
    return {
        start: available && status === undefined,
        pause: available && status === 'running',
        resume: available && status !== undefined && status !== 'running',
        drain: available && active && status !== 'draining',
        stop: available && active,
        parallelism: available && active,
    };
}
export function configurationEditable(status, loaded, busy, worker) {
    return loaded && !busy && !worker && (status === undefined || status === 'stopped');
}
export function shouldHydrateConfiguration(previousRunId, runId, dirty, previousConfig, currentConfig) {
    return previousRunId !== runId || !dirty && previousConfig !== currentConfig;
}
/** Export data rather than interpreting a report string as a URL or HTML. */
export function reviewExport(task, review) {
    let report = review.report;
    try {
        report = JSON.parse(review.report);
    }
    catch { /* Failed gates may retain plain diagnostic text. */ }
    return JSON.stringify({ taskId: task.id, ticketId: task.ticket.id, at: review.at, passed: review.passed, headSha: review.headSha, findings: review.findings, report }, null, 2);
}
function ReviewEvidenceRow({ task, review, index }) {
    const [download, setDownload] = useState();
    const payload = reviewExport(task, review);
    useEffect(() => {
        const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
        setDownload(url);
        return () => URL.revokeObjectURL(url);
    }, [payload]);
    const filename = `delivery-review-${task.ticket.id.replace(/[^a-zA-Z0-9_-]/g, '-')}-${index + 1}.json`;
    const historical = index < (task.reviewHistory?.length ?? 0) - 1;
    return _jsxs("article", { className: css.reviewRecord, children: [_jsxs("div", { className: css.reviewHeading, children: [_jsxs("strong", { children: ["Review ", index + 1] }), _jsx("span", { className: css.status, "data-status": review.passed ? 'ready' : historical ? 'waiting' : 'failed', children: review.passed ? 'Passed at review' : historical ? 'Historical failure' : 'Failed' }), _jsx("span", { children: review.failureKind === 'team-evidence' ? 'Team evidence unavailable' : review.failureKind === 'infrastructure' ? 'Verification could not complete' : `${review.findings.length} ${review.findings.length === 1 ? 'finding' : 'findings'}` }), _jsx("a", { href: download, download: filename, "aria-disabled": !download, children: "Download JSON \u2193" })] }), _jsxs("div", { className: css.reviewMetadata, children: [_jsx("time", { dateTime: review.at, children: new Date(review.at).toLocaleString() }), _jsxs("span", { children: ["Reviewed commit ", _jsx("code", { children: review.headSha || 'Unavailable' })] })] }), review.findings.length > 0 && _jsx("ul", { className: css.findings, children: review.findings.map((finding, findingIndex) => _jsx("li", { children: finding }, findingIndex)) }), _jsxs("details", { children: [_jsx("summary", { children: "Report excerpt" }), _jsx("pre", { children: review.report ? review.report.slice(0, 4000) : 'No report text was returned.' }), review.report.length > 4000 && _jsx("p", { className: css.muted, children: "Showing the first 4,000 characters. Download JSON for the complete report." })] })] });
}
export function CaptainReviewEvidence({ task }) {
    const latest = task.reviewHistory?.at(-1);
    return _jsxs("div", { className: css.reviewEvidence, children: [_jsx("h3", { children: "Review evidence" }), _jsx("p", { className: css.muted, children: "Results describe the recorded commit at review time. Later branch changes require a new review." }), latest && _jsx("p", { className: css.authorization, children: latest.passed ? task.status === 'merged' && latest.headSha === task.headSha ? 'Current gate passed; reviewed commit was delivered.' : 'Last recorded review passed; current head must still match before merge.' : `Latest gate failed: ${latest.failureKind === 'team-evidence' ? 'original team evidence must be repaired' : latest.failureKind === 'infrastructure' ? 'verification infrastructure must be repaired' : 'findings must be resolved'}. Historical entries remain below.` }), task.reviewHistory?.length ? task.reviewHistory.map((review, index) => _jsx(ReviewEvidenceRow, { task: task, review: review, index: index }, `${review.at}-${index}`)) : _jsx("p", { className: css.placeholder, children: "No independent review has been recorded yet." })] });
}
/** Bounded DAG layout; cycles stay visible rather than recursing forever. */
export function eligibilityGraph(tickets) {
    const byId = new Map(tickets.map(t => [t.id, { ...t, missing: false }]));
    for (const ticket of tickets)
        for (const id of ticket.predecessors)
            if (!byId.has(id))
                byId.set(id, { id, title: 'Missing predecessor', predecessors: [], missing: true });
    const levels = new Map(), remaining = new Set(byId.keys());
    for (let pass = 0; pass < byId.size && remaining.size; pass++)
        for (const id of [...remaining]) {
            const node = byId.get(id);
            if (node.predecessors.every(p => levels.has(p))) {
                levels.set(id, node.predecessors.length ? 1 + Math.max(...node.predecessors.map(p => levels.get(p))) : 0);
                remaining.delete(id);
            }
        }
    for (const id of remaining)
        levels.set(id, 0);
    const counts = new Map();
    const nodes = [...byId.values()].map(node => { const column = levels.get(node.id) ?? 0, row = counts.get(column) ?? 0; counts.set(column, row + 1); return { ...node, x: 20 + column * 240, y: 20 + row * 130 }; });
    const edges = tickets.flatMap(t => t.predecessors.map(from => ({ from, to: t.id })));
    return { nodes, edges, width: Math.max(280, ...nodes.map(n => n.x + 230)), height: Math.max(160, ...nodes.map(n => n.y + 120)) };
}
export function CaptainEligibilityGraph({ tickets, rows }) {
    const [selected, setSelected] = useState();
    const arrowId = `darkingdoom-arrow-${useId().replace(/:/g, '')}`;
    const graph = eligibilityGraph(tickets), byId = new Map(graph.nodes.map(n => [n.id, n])), decisions = new Map(rows.map(r => [r.ticketId, r]));
    const node = byId.get(selected ?? ''), decision = decisions.get(selected ?? '');
    return _jsxs(_Fragment, { children: [_jsx("p", { className: css.muted, children: "Arrows point from prerequisites to dependent tickets. Parking frees capacity but does not satisfy a predecessor. Independent tickets in later milestones can still run; milestone order sets priority." }), _jsx("div", { className: css.graphScroll, role: "region", "aria-label": "Ticket dependency graph", tabIndex: 0, children: _jsxs("div", { className: css.graphCanvas, style: { width: graph.width, height: graph.height }, children: [_jsxs("svg", { width: graph.width, height: graph.height, "aria-hidden": "true", children: [_jsx("defs", { children: _jsx("marker", { id: arrowId, viewBox: "0 0 10 10", refX: "9", refY: "5", markerWidth: "7", markerHeight: "7", orient: "auto", children: _jsx("path", { d: "M 0 0 L 10 5 L 0 10 z", fill: "#607d91" }) }) }), graph.edges.map((edge, index) => { const a = byId.get(edge.from), b = byId.get(edge.to); return _jsx("path", { d: `M ${a.x + 205} ${a.y + 48} C ${a.x + 225} ${a.y + 48}, ${b.x - 20} ${b.y + 48}, ${b.x} ${b.y + 48}`, fill: "none", stroke: "#607d91", strokeWidth: "2", markerEnd: `url(#${arrowId})` }, index); })] }), graph.nodes.map(n => { const row = decisions.get(n.id); return _jsxs("button", { type: "button", className: css.graphNode, style: { left: n.x, top: n.y }, "data-status": row?.state ?? 'dependency', "aria-pressed": selected === n.id, "aria-label": `Ticket ${n.id}: ${row?.state ?? 'missing predecessor'}. ${row?.reason ?? n.title}. ${scopeLabel(row)}`, onClick: () => setSelected(n.id), children: [_jsxs("strong", { children: ["#", n.id, " ", _jsx("span", { children: row?.state ?? 'missing' })] }), _jsx("p", { children: n.title }), _jsxs("small", { children: [tickets.find(t => t.id === n.id)?.milestone || 'Unassigned', scopeLabel(row) && ` · ${scopeLabel(row)}`] })] }, n.id); })] }) }), node && _jsxs("div", { className: css.graphDetail, children: [_jsxs("strong", { children: ["#", node.id, " \u00B7 ", node.title] }), _jsx("p", { children: decision?.reason ?? 'Missing from discovery; delivery cannot proceed without predecessor evidence.' }), scopeLabel(decision) && _jsx("p", { children: scopeLabel(decision) }), _jsxs("small", { children: ["Predecessors: ", node.predecessors.join(', ') || 'None'] })] }), _jsxs("details", { children: [_jsxs("summary", { children: ["All eligibility reasons (", rows.length, ")"] }), _jsx("ul", { className: css.records, children: rows.map(row => _jsxs("li", { children: [_jsx("code", { children: row.ticketId }), " ", _jsx("span", { className: css.status, "data-status": row.state ?? 'waiting', children: row.state ?? (row.eligible ? 'eligible' : 'waiting') }), scopeLabel(row) && _jsx("small", { children: scopeLabel(row) }), _jsx("p", { children: row.reason })] }, row.ticketId)) })] })] });
}
export function elapsedMs(start, end, now) {
    const value = (end ? Date.parse(end) : now) - Date.parse(start);
    return Number.isFinite(value) ? Math.max(0, value) : 0;
}
export function phaseDurations(task, now) {
    const events = task.phases.filter(event => Number.isFinite(Date.parse(event.at))).slice().sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    const totals = new Map();
    for (const [index, event] of events.entries()) {
        const milliseconds = elapsedMs(event.at, events[index + 1]?.at ?? task.finishedAt, now);
        totals.set(event.phase, (totals.get(event.phase) ?? 0) + milliseconds);
    }
    return Array.from(totals, ([phase, milliseconds]) => ({ phase, milliseconds }));
}
export function webUrl(value) {
    if (!value)
        return undefined;
    try {
        const url = new URL(value);
        return ['http:', 'https:'].includes(url.protocol) ? url.href : undefined;
    }
    catch {
        return undefined;
    }
}
function duration(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    if (seconds < 60)
        return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    return minutes < 60 ? `${minutes}m ${seconds % 60}s` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
function defaults(workspace = '') {
    return { provider: 'github', repository: '', workspace, milestones: [], includeUnmilestoned: true, includeRequiredPredecessors: true, ocrMaxTokensBudget: 1_000_000, remote: '', targetBranch: '', parallelism: 2, maxTickets: 0, maxTeamMembers: 4, pollSeconds: 30, maxRepairRounds: 3, maxTaskMinutes: 120, verifyCommands: [], workerPreset: 'standard', requireBrowser: false, requireMemory: false };
}
function lines(value) { return value.split(/\r?\n/).map(line => line.trim()).filter(Boolean); }
export function parseTicketSelection(value) {
    const ids = value.split(/[\s,]+/).filter(Boolean);
    return ids.length ? ids : undefined;
}
function terminal(task) { return ['merged', 'failed', 'cancelled'].includes(task.status); }
async function request(url, signal, body) {
    const response = await fetch(url, { signal, credentials: 'same-origin', ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
    const value = await response.json().catch(() => null);
    if (!response.ok) {
        const detail = value && typeof value === 'object' && 'error' in value ? String(value.error) : response.statusText;
        throw new Error(`${body === undefined ? 'GET' : 'POST'} ${url.split('?')[0]} — ${response.status}: ${detail || 'DarKingDoom Plugin request failed'}`);
    }
    return value;
}
export function CaptainPanel({ sessionId, workspace, onClose, openSession, initialSnapshot }) {
    const [snapshot, setSnapshot] = useState(initialSnapshot ?? { run: null });
    const [config, setConfig] = useState(() => ({ ...defaults(workspace), ...initialSnapshot?.run?.config, ...(initialSnapshot?.run ? intakePolicy(initialSnapshot.run.config) : {}) }));
    const [policy, setPolicy] = useState(() => intakePolicy(initialSnapshot?.run?.config ?? defaults(workspace)));
    const [milestones, setMilestones] = useState('');
    const [commands, setCommands] = useState('');
    const [ticketSelection, setTicketSelection] = useState(initialSnapshot?.run?.config.ticketIds?.join(', ') ?? '');
    const [busy, setBusy] = useState(false);
    const [loaded, setLoaded] = useState(!!initialSnapshot);
    const [repository, setRepository] = useState(null);
    const [contextLoading, setContextLoading] = useState(true);
    const [source, setSource] = useState();
    const [view, setView] = useState('configuration');
    const [error, setError] = useState(null);
    const [pollError, setPollError] = useState(null);
    const [contextError, setContextError] = useState(null);
    const [notice, setNotice] = useState(null);
    const [nativeEvidence, setNativeEvidence] = useState(null);
    const [nativeEvidenceError, setNativeEvidenceError] = useState(null);
    const [nativeEvidenceLoading, setNativeEvidenceLoading] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [now, setNow] = useState(Date.now());
    const [selected, setSelected] = useState(null);
    const [parallelism, setParallelism] = useState(2);
    const [resumeEvidence, setResumeEvidence] = useState('');
    const controller = useRef(null);
    const generation = useRef(0);
    const mutation = useRef(false);
    const hydrated = useRef(null);
    const hydratedConfig = useRef('');
    const draftDirty = useRef(false);
    const policyDirty = useRef(false);
    const policyRun = useRef(initialSnapshot?.run?.id ?? null);
    const commandsEdited = useRef(false);
    const run = snapshot.run;
    const worker = snapshot.role === 'worker' || !!run && run.captainSessionId !== sessionId;
    const allowed = captainActionAvailability(run?.status, loaded, busy);
    const editable = configurationEditable(run?.status, loaded, busy, worker);
    const policyEditable = loaded && !busy && !worker && (run?.status === 'running' || run?.status === 'paused');
    const task = worker ? run?.tasks[0] : run?.tasks.find(item => item.id === selected);
    const displayedError = error ?? pollError ?? (!worker ? contextError : null);
    const markDirty = () => { draftDirty.current = true; setDirty(true); };
    const set = (key, value) => { markDirty(); setConfig(previous => ({ ...previous, [key]: value })); };
    const setPolicyValue = (key, value) => { policyDirty.current = true; setPolicy(previous => ({ ...previous, [key]: value })); };
    useEffect(() => {
        if (!loaded || worker || run && run.status !== 'stopped')
            return;
        const abort = new AbortController();
        setContextLoading(true);
        const provider = run?.config.provider ?? source;
        void request(`/api/darkingdoom/context?sessionId=${encodeURIComponent(sessionId)}${provider ? `&provider=${provider}` : ''}`, abort.signal).then(value => {
            if (abort.signal.aborted)
                return;
            setContextError(null);
            setRepository(value);
            if (run || hydrated.current)
                return;
            setConfig(previous => ({ ...previous, provider: value.config.provider, workspace: value.config.workspace, repository: value.config.repository, organization: value.config.organization, project: value.config.project, remote: value.config.remote, targetBranch: value.config.targetBranch, query: undefined }));
            setMilestones(value.config.milestones.join('\n'));
            if (!commandsEdited.current)
                setCommands(value.config.verifyCommands.join('\n'));
        }).catch(cause => { if (!abort.signal.aborted) {
            setRepository(null);
            setContextError(String(cause instanceof Error ? cause.message : cause));
        } })
            .finally(() => { if (!abort.signal.aborted)
            setContextLoading(false); });
        return () => abort.abort();
    }, [loaded, run?.status, sessionId, source, worker]);
    const refresh = useCallback(async (signal) => {
        const version = ++generation.current;
        let value;
        try {
            value = await request(`/api/darkingdoom/state?sessionId=${encodeURIComponent(sessionId)}`, signal);
        }
        catch (cause) {
            if (signal.aborted || version !== generation.current)
                return;
            throw cause;
        }
        if (signal.aborted || version !== generation.current)
            return;
        if (!value || typeof value !== 'object' || !('run' in value))
            throw new Error('DarKingDoom Plugin returned an invalid state');
        setPollError(null);
        setSnapshot(value);
        setLoaded(true);
        if (value.run && (policyRun.current !== value.run.id || !policyDirty.current)) {
            policyRun.current = value.run.id;
            policyDirty.current = false;
            setPolicy(intakePolicy(value.run.config));
        }
        if (value.run && shouldHydrateConfiguration(hydrated.current, value.run.id, draftDirty.current, hydratedConfig.current, JSON.stringify(value.run.config))) {
            const newRun = hydrated.current !== value.run.id;
            hydrated.current = value.run.id;
            hydratedConfig.current = JSON.stringify(value.run.config);
            draftDirty.current = false;
            setDirty(false);
            setConfig(value.run.config);
            setMilestones(value.run.config.milestones.join('\n'));
            setCommands(value.run.config.verifyCommands.join('\n'));
            setTicketSelection(value.run.config.ticketIds?.join(', ') ?? '');
            setParallelism(value.run.config.parallelism);
            if (newRun)
                setView('monitor');
        }
    }, [sessionId]);
    useEffect(() => {
        const abort = new AbortController();
        controller.current = abort;
        let timer;
        const poll = async () => {
            if (!mutation.current) {
                try {
                    await refresh(abort.signal);
                }
                catch (cause) {
                    if (!abort.signal.aborted)
                        setPollError(String(cause instanceof Error ? cause.message : cause));
                }
            }
            if (!abort.signal.aborted)
                timer = setTimeout(() => { void poll(); }, 3000);
        };
        void poll();
        const clock = setInterval(() => setNow(Date.now()), 1000);
        return () => { abort.abort(); clearTimeout(timer); clearInterval(clock); generation.current++; };
    }, [refresh]);
    async function mutate(action) {
        const signal = controller.current?.signal;
        if (!signal || mutation.current)
            return;
        if (action === 'policy' && (!policyEditable || !validReviewBudget(policy.ocrMaxTokensBudget)))
            return;
        if ((action === undefined || action === 'save') && !validReviewBudget(config.ocrMaxTokensBudget ?? 1_000_000))
            return;
        mutation.current = true;
        generation.current++;
        setBusy(true);
        setError(null);
        try {
            const value = await request(action === 'policy' ? '/api/darkingdoom/policy' : action === 'save' ? '/api/darkingdoom/configure' : action ? '/api/darkingdoom/control' : '/api/darkingdoom/start', signal, action === 'policy' ? { sessionId, ...policy } : action && action !== 'save'
                ? { sessionId, action, ...(action === 'parallelism' ? { parallelism } : {}) }
                : { sessionId, config: { ...config, ...intakePolicy(config), ticketIds: parseTicketSelection(ticketSelection), milestones: lines(milestones), verifyCommands: lines(commands) } });
            if (action === 'policy') {
                policyDirty.current = false;
                setPolicy(intakePolicy(value.run.config));
                setNotice('Policy saved. Intake changes apply to new dispatch; each future OCR review session uses its own token budget.');
            }
            if (action === 'save') {
                draftDirty.current = false;
                setDirty(false);
                hydratedConfig.current = JSON.stringify(value.run.config);
                setConfig(value.run.config);
                setMilestones(value.run.config.milestones.join('\n'));
                setCommands(value.run.config.verifyCommands.join('\n'));
                setParallelism(value.run.config.parallelism);
                setTicketSelection(value.run.config.ticketIds?.join(', ') ?? '');
                setNotice('Configuration saved. The run is still stopped; choose Resume when ready.');
            }
            await refresh(signal);
        }
        catch (cause) {
            if (!signal.aborted)
                setError(cause instanceof Error ? cause.message : String(cause));
        }
        finally {
            mutation.current = false;
            if (!signal.aborted)
                setBusy(false);
        }
    }
    function start(event) { event.preventDefault(); void mutate(run?.status === 'stopped' ? 'save' : undefined); }
    async function navigate(childId) {
        try {
            await openSession(sessionId, childId);
        }
        catch (cause) {
            setError(`Could not open worker session: ${String(cause)}`);
        }
    }
    async function resumeParked(item) {
        const signal = controller.current?.signal;
        if (!signal || busy || worker)
            return;
        setBusy(true);
        mutation.current = true;
        try {
            await request('/api/darkingdoom/resume-task', signal, { sessionId, taskId: item.id, evidence: resumeEvidence });
            setResumeEvidence('');
            await refresh(signal);
        }
        catch (cause) {
            setError(String(cause));
        }
        finally {
            mutation.current = false;
            setBusy(false);
        }
    }
    async function inspectNativeActivity() {
        const signal = controller.current?.signal;
        if (!signal || nativeEvidenceLoading || !run)
            return;
        setNativeEvidenceLoading(true);
        setNativeEvidenceError(null);
        try {
            const evidence = await request(`/api/darkingdoom/evidence?sessionId=${encodeURIComponent(sessionId)}`, signal);
            if (!evidence || !Array.isArray(evidence.workers))
                throw new Error('DarKingDoom Plugin returned invalid native activity evidence');
            if (!signal.aborted)
                setNativeEvidence(evidence);
        }
        catch (cause) {
            if (!signal.aborted)
                setNativeEvidenceError(String(cause instanceof Error ? cause.message : cause));
        }
        finally {
            if (!signal.aborted)
                setNativeEvidenceLoading(false);
        }
    }
    const merged = run?.tasks.filter(item => item.status === 'merged').length ?? 0;
    const reservedSlots = run?.tasks.filter(item => ['starting', 'running', 'ready'].includes(item.status) || ['blocked', 'parked'].includes(item.status) && item.executionActive).length ?? 0;
    const blockers = run?.tasks.filter(item => item.error || item.status === 'blocked' || item.status === 'parked' || item.status === 'failed') ?? [];
    const totalTaskTime = run?.tasks.reduce((sum, item) => sum + elapsedMs(item.startedAt, item.finishedAt, now), 0) ?? 0;
    const eligibility = snapshot.eligibility ?? run?.tickets.map(ticket => {
        const existing = run.tasks.find(item => item.ticket.id === ticket.id);
        return { ticketId: ticket.id, eligible: false, reason: existing ? `Task ${existing.status}` : ticket.exclusion ?? (ticket.merged ? 'Already merged' : ticket.state === 'closed' ? 'Closed' : 'Awaiting captain eligibility evaluation') };
    }) ?? [];
    return _jsxs("section", { className: css.panel, role: "region", "aria-labelledby": "darkingdoom-title", "data-darkingdoom": true, children: [_jsxs("header", { className: css.header, children: [_jsxs("div", { className: css.heading, children: [_jsx("span", { className: css.mark, "aria-hidden": true, children: "\u2301" }), _jsxs("div", { children: [_jsx("span", { className: css.eyebrow, children: "AUTONOMOUS DELIVERY" }), _jsx("h1", { id: "darkingdoom-title", children: "DarKingDoom Plugin" })] }), _jsx("span", { className: css.status, "data-status": run?.status ?? 'idle', children: run?.status ?? 'Not started' })] }), _jsx("button", { type: "button", onClick: onClose, "aria-label": "Close DarKingDoom Plugin", children: "\u2715" })] }), _jsxs("div", { className: css.owner, children: ["Session ", _jsx("code", { children: sessionId }), _jsx("span", { children: "Opening this panel never starts a run." })] }), worker && _jsxs("div", { className: css.origin, children: [_jsx("span", { children: "Initiated by coordination session" }), _jsxs("button", { type: "button", onClick: () => void navigate(run.captainSessionId), children: [run.captainSessionId, " \u2197"] }), _jsx("small", { children: "This worker view is read-only. Run controls belong to the coordinator." })] }), displayedError && _jsxs("div", { className: css.error, role: "alert", children: [_jsx("span", { children: displayedError }), _jsx("button", { type: "button", onClick: () => { setError(null); setPollError(null); setContextError(null); }, children: "Dismiss" })] }), notice && _jsxs("div", { className: css.origin, role: "status", children: [_jsx("span", { children: notice }), _jsx("button", { type: "button", onClick: () => setNotice(null), children: "Dismiss" })] }), run?.error && _jsxs("div", { className: css.error, role: "alert", children: ["Captain: ", run.error] }), !worker && run?.coordinatorLoopError && _jsx("div", { className: css.error, role: "alert", children: run.coordinatorLoopError }), !worker && run && _jsxs("div", { className: css.origin, "aria-label": "Coordinator loop", children: [_jsxs("strong", { children: ["Coordinator loop: ", snapshot.coordinatorLoop?.status === 'active' && snapshot.coordinatorLoop.activation !== 'armed' ? 'needs Resume' : snapshot.coordinatorLoop?.status ?? 'not started'] }), _jsxs("small", { children: [snapshot.coordinatorLoop?.maxGoalRounds ? `Native DSH goal · ${snapshot.coordinatorLoop.roundsStarted ?? 0} / ${snapshot.coordinatorLoop.maxGoalRounds} rounds` : 'Start or Resume enables native loop mode in this main chat.', snapshot.coordinatorLoop?.status === 'waiting' ? ' · Quietly awaiting new delivery events' : ''] }), snapshot.coordinatorLoop?.reason && _jsx("p", { children: snapshot.coordinatorLoop.reason }), run.status === 'running' && snapshot.coordinatorLoop?.activation !== 'armed' && _jsx("button", { type: "button", disabled: busy || !loaded, onClick: () => void mutate('loop'), children: snapshot.coordinatorLoop?.status === 'waiting' ? 'Wake coordinator' : 'Start coordinator loop' })] }), !worker && _jsxs("nav", { className: css.views, "aria-label": "Plugin view", children: [_jsx("button", { type: "button", "aria-pressed": view === 'configuration', onClick: () => setView('configuration'), children: "Configuration" }), _jsx("button", { type: "button", "aria-pressed": view === 'monitor', onClick: () => setView('monitor'), children: "Monitor" })] }), _jsxs("div", { className: css.body, children: [!worker && _jsxs("aside", { hidden: view !== 'configuration', className: css.configuration, children: [_jsxs("div", { className: css.sectionTitle, children: [_jsx("h2", { children: "Run configuration" }), _jsx("span", { children: run ? 'Saved run configuration' : contextLoading ? 'Loading repository configuration…' : 'From the current session repository' })] }), !run && repository?.warnings.map((warning, index) => _jsx("p", { className: css.muted, children: warning }, index)), _jsxs("form", { onSubmit: start, children: [_jsxs("fieldset", { disabled: !editable, className: css.fields, children: [_jsxs("label", { children: ["Ticket source", _jsxs("select", { disabled: !!run || contextLoading && loaded, value: config.provider, onChange: event => { setContextLoading(true); setSource(event.target.value); }, children: [_jsx("option", { value: "github", disabled: repository ? !repository.providers.includes('github') : false, children: "GitHub Issues" }), _jsx("option", { value: "azure", disabled: repository ? !repository.providers.includes('azure') : false, children: "Azure DevOps" })] })] }), _jsxs("label", { children: ["Repository", _jsx("input", { required: true, readOnly: true, value: config.repository, placeholder: "Detected from this session" })] }), _jsxs("label", { children: ["Workspace", _jsx("input", { required: true, readOnly: true, value: config.workspace, placeholder: "Current session repository" })] }), config.provider === 'azure' && _jsxs(_Fragment, { children: [_jsxs("label", { children: ["Organization URL", _jsx("input", { required: true, readOnly: true, value: config.organization ?? '' })] }), _jsxs("label", { children: ["Project", _jsx("input", { required: true, readOnly: true, value: config.project ?? '' })] })] }), _jsxs("label", { children: ["Query ", _jsx("span", { className: css.optional, children: "(optional)" }), _jsx("textarea", { rows: 2, value: config.query ?? '', onChange: event => set('query', event.target.value), placeholder: config.provider === 'azure' ? 'WIQL query' : 'Additional issue search filters' })] }), _jsxs("label", { children: ["Ticket IDs ", _jsx("span", { className: css.optional, children: "(optional)" }), _jsx("input", { value: ticketSelection, onChange: event => { markDirty(); setTicketSelection(event.target.value); }, placeholder: "All eligible tickets" }), _jsx("small", { children: "Separate IDs with commas. Blank allows all eligible tickets; selected milestone scope and dependency gates still apply." })] }), _jsxs("label", { children: ["Milestones, in priority order", _jsx("textarea", { disabled: contextLoading, required: !config.includeUnmilestoned, rows: 3, value: milestones, onChange: event => { markDirty(); setMilestones(event.target.value); }, placeholder: "Detected delivery milestones" }), _jsx("small", { children: repository?.milestoneSource || 'One exact milestone name per line. Leave blank to run only tickets without a milestone when enabled.' })] }), _jsxs("label", { className: css.check, children: [_jsx("input", { type: "checkbox", checked: config.includeUnmilestoned ?? false, onChange: event => set('includeUnmilestoned', event.target.checked) }), "Include tickets without a milestone"] }), _jsxs("label", { className: css.check, children: [_jsx("input", { type: "checkbox", checked: config.includeRequiredPredecessors ?? false, onChange: event => set('includeRequiredPredecessors', event.target.checked) }), "Include required predecessors outside the selected milestones"] }), _jsx("p", { className: css.muted, children: "Milestone order sets priority; dependencies still gate dispatch. Required predecessors can run before the selected tickets that need them." }), _jsxs("label", { children: ["Token budget per independent review session", _jsx("input", { required: true, type: "number", min: 1, step: 1, max: MAX_OCR_TOKENS_BUDGET, value: config.ocrMaxTokensBudget ?? 1_000_000, onChange: event => set('ocrMaxTokensBudget', Number(event.target.value)) }), _jsx("small", { children: "Each review has its own budget; no shared pool across workers or the run." })] }), _jsxs("label", { children: ["Parked recovery threshold", _jsx("input", { required: true, type: "number", min: 0, max: 1000, value: config.parkedRecoveryThreshold ?? 4, onChange: event => set('parkedRecoveryThreshold', Number(event.target.value)) }), _jsx("small", { children: "Above this count, hold new intake and investigate in one dedicated recovery session." })] }), _jsxs("label", { children: ["Primary code review", _jsxs("select", { value: config.reviewBackend ?? 'agent', onChange: event => set('reviewBackend', event.target.value), children: [_jsx("option", { value: "agent", children: "Independent agent" }), _jsx("option", { value: "ocr", children: "OpenCodeReview" })] })] }), _jsxs("label", { className: css.check, children: [_jsx("input", { type: "checkbox", checked: config.ocrAdditionalCheck ?? false, onChange: event => set('ocrAdditionalCheck', event.target.checked) }), "Optional additional OCR check"] }), _jsxs("div", { className: css.pair, children: [_jsxs("label", { children: ["Remote", _jsx("input", { required: true, readOnly: true, value: config.remote })] }), _jsxs("label", { children: ["Target branch", _jsx("input", { required: true, readOnly: true, value: config.targetBranch })] })] }), _jsxs("div", { className: css.pair, children: [_jsxs("label", { children: ["Parallel tickets", _jsx("input", { required: true, type: "number", min: 1, max: 32, value: config.parallelism, onChange: event => set('parallelism', Number(event.target.value)) })] }), _jsxs("label", { children: ["Members / team", _jsx("input", { required: true, type: "number", min: 1, max: 16, value: config.maxTeamMembers, onChange: event => set('maxTeamMembers', Number(event.target.value)) })] })] }), _jsxs("label", { children: ["Verification commands", _jsx("textarea", { disabled: contextLoading, required: true, rows: 3, value: commands, onChange: event => { markDirty(); commandsEdited.current = true; setCommands(event.target.value); }, placeholder: "Detected repository checks" }), _jsx("small", { children: repository?.verificationSource || 'One host command per line, run in each task worktree.' })] }), _jsxs("details", { children: [_jsx("summary", { children: "Execution limits & verification" }), _jsxs("div", { className: css.fields, children: [_jsxs("div", { className: css.pair, children: [_jsxs("label", { children: ["Poll seconds", _jsx("input", { required: true, type: "number", min: 5, max: 3600, value: config.pollSeconds, onChange: event => set('pollSeconds', Number(event.target.value)) })] }), _jsxs("label", { children: ["Repair rounds", _jsx("input", { required: true, type: "number", min: 0, max: 20, value: config.maxRepairRounds, onChange: event => set('maxRepairRounds', Number(event.target.value)) })] })] }), _jsxs("label", { children: ["Task timeout (minutes)", _jsx("input", { required: true, type: "number", min: 1, max: 1440, value: config.maxTaskMinutes, onChange: event => set('maxTaskMinutes', Number(event.target.value)) })] }), _jsxs("label", { children: ["Ticket limit", _jsx("input", { required: true, type: "number", min: 0, max: 100000, value: config.maxTickets ?? 0, onChange: event => set('maxTickets', Number(event.target.value)) }), _jsx("small", { children: "0 keeps consuming; 1 runs a single-ticket trial. Attempts count toward the limit." })] }), _jsxs("label", { children: ["Worker preset", _jsx("input", { required: true, value: config.workerPreset, onChange: event => set('workerPreset', event.target.value) })] }), _jsxs("label", { className: css.check, children: [_jsx("input", { type: "checkbox", checked: config.requireMemory, onChange: event => set('requireMemory', event.target.checked) }), "Require durable memory"] }), _jsxs("label", { className: css.check, children: [_jsx("input", { type: "checkbox", checked: config.requireBrowser, onChange: event => set('requireBrowser', event.target.checked) }), "Require browser verification"] })] })] })] }), _jsx("p", { className: css.authorization, children: "Start enables the native coordinator loop in this chat and authorizes full access execution, autonomous repair, review, merge and ticket closure within this configuration. The captain answers worker questions automatically." }), _jsx("button", { type: "submit", className: css.primary, disabled: !(run?.status === 'stopped' ? editable : allowed.start) || contextLoading || !repository || !config.targetBranch || (!config.includeUnmilestoned && !lines(milestones).length) || lines(milestones).some(name => !repository.milestoneCatalog.includes(name)) || !lines(commands).length || !validReviewBudget(config.ocrMaxTokensBudget ?? 1_000_000), children: busy ? 'Applying…' : run?.status === 'stopped' ? 'Save configuration' : run ? 'Run already created' : 'Start DarKingDoom Plugin' }), run?.status === 'stopped' && _jsx("p", { className: css.muted, children: "Save changes, then use Resume in Monitor. History, parked tasks and existing task contracts are preserved; new settings apply to future tickets. Source, repository and target identity stay bound to this run." }), !loaded && _jsx("p", { className: css.muted, children: "Loading saved run before enabling Start\u2026" })] })] }), _jsxs("main", { hidden: !worker && view !== 'monitor', className: css.monitor, children: [worker && task && _jsxs("section", { className: css.card, children: [_jsxs("div", { className: css.sectionTitle, children: [_jsxs("h2", { children: ["#", task.ticket.id, " \u00B7 ", task.ticket.title] }), _jsx("span", { className: css.status, "data-status": task.status, children: task.status })] }), _jsxs("div", { className: css.metrics, children: [_jsxs("div", { children: [_jsx("span", { children: "Total task elapsed" }), _jsx("strong", { children: duration(elapsedMs(task.startedAt, task.finishedAt, now)) }), _jsx("small", { children: "Includes blocked and parked waiting" })] }), _jsxs("div", { children: [_jsx("span", { children: "Current phase" }), _jsx("strong", { children: task.phase }), _jsx("small", { children: task.finishedAt ? 'Finished' : 'Ongoing' })] })] }), task.parkReason && task.status === 'parked' && _jsxs("p", { className: css.authorization, children: ["Parked: ", task.parkReason, ". Waiting for a changed prerequisite or human help."] })] }), !worker && _jsxs(_Fragment, { children: [_jsxs("div", { className: css.metrics, children: [_jsxs("div", { children: [_jsx("span", { children: "Wall time" }), _jsx("strong", { children: run ? duration(elapsedMs(run.createdAt, run.status === 'stopped' ? run.stoppedAt ?? run.updatedAt : undefined, now)) : '—' }), _jsx("small", { children: "Includes waiting & pauses" })] }), _jsxs("div", { children: [_jsx("span", { children: "Reserved task slots / parallel limit" }), _jsxs("strong", { children: [reservedSlots, _jsxs("em", { children: [" / ", run?.config.parallelism ?? config.parallelism] })] }), _jsxs("small", { children: [merged, " merged \u00B7 ", run?.tasks.filter(item => item.status === 'blocked').length ?? 0, " blocked \u00B7 ", run?.tasks.filter(item => item.status === 'parked').length ?? 0, " parked"] })] }), _jsxs("div", { children: [_jsx("span", { children: "Task elapsed, summed" }), _jsx("strong", { children: run ? duration(totalTaskTime) : '—' }), _jsx("small", { children: "Overlaps; includes waiting" })] }), _jsxs("div", { children: [_jsx("span", { children: "Active agent effort" }), _jsx("strong", { className: css.unmeasured, children: "Not measured" }), _jsx("small", { children: "No runtime effort telemetry" })] })] }), _jsxs("div", { className: css.controls, "aria-label": "Run controls", children: [_jsx("button", { disabled: !allowed.pause, onClick: () => void mutate('pause'), children: "Pause" }), _jsx("button", { disabled: !allowed.resume || dirty, onClick: () => void mutate('resume'), title: dirty ? 'Save configuration before resuming' : undefined, children: "Resume" }), _jsx("button", { disabled: !allowed.drain, onClick: () => void mutate('drain'), title: "Finish active work without taking more tickets", children: "Drain" }), _jsx("button", { disabled: !loaded || busy || !run, onClick: () => void mutate(run?.intakeMode === 'existing-only' ? 'allow-new-tickets' : 'finish-existing'), title: "Keep leadership and existing-task recovery running without admitting more tickets", children: run?.intakeMode === 'existing-only' ? 'Allow new tickets' : 'Finish existing tasks' }), _jsx("button", { className: css.danger, disabled: !allowed.stop, onClick: () => void mutate('stop'), children: "Stop" }), _jsxs("label", { children: ["Parallelism", _jsx("input", { "aria-label": "Live parallelism", type: "number", min: 1, max: 32, value: parallelism, disabled: !allowed.parallelism, onChange: event => setParallelism(Number(event.target.value)) })] }), _jsx("button", { disabled: !allowed.parallelism || !Number.isInteger(parallelism) || parallelism < 1 || parallelism > 32, onClick: () => void mutate('parallelism'), children: "Apply" })] }), _jsxs("section", { className: css.card, "aria-label": "Native execution evidence", children: [_jsxs("div", { className: css.sectionTitle, children: [_jsx("h2", { children: "Native execution evidence" }), _jsx("span", { children: "Read-only snapshot" })] }), _jsx("p", { className: css.muted, children: "Reserved task slots can include queued inbox messages. A queued message is not proof of a live model stream; inspect root, inbox, and owned activity separately." }), _jsx("button", { type: "button", disabled: !loaded || nativeEvidenceLoading || !run, onClick: () => void inspectNativeActivity(), children: nativeEvidenceLoading ? 'Inspecting…' : 'Inspect native activity' }), nativeEvidenceError && _jsxs("p", { className: css.error, role: "alert", children: ["Native activity unavailable: ", nativeEvidenceError] }), nativeEvidence && _jsxs("div", { className: css.fields, children: [_jsxs("p", { className: css.muted, children: ["Host ", nativeEvidence.host ?? 'unknown', " \u00B7 read-only evidence; no queued message was sent or changed."] }), nativeEvidence.workers.map(worker => {
                                                        const task = run?.tasks.find(item => item.id === worker.taskId);
                                                        const inbox = worker.lifecycle?.inbox;
                                                        const pending = inbox?.readable ? (inbox.nextTurn ?? 0) + (inbox.nextStep ?? 0) : undefined;
                                                        const queuedIdle = worker.lifecycle?.status === 'idle' && pending !== undefined && pending > 0;
                                                        const activity = worker.execution?.active === null || worker.execution?.active === undefined ? 'unknown' : worker.execution.active ? 'owned activity or pending input observed' : 'no native activity observed';
                                                        const observedAt = worker.execution?.observedAt ?? worker.lifecycle?.observedAt;
                                                        return _jsxs("article", { className: css.reviewRecord, children: [_jsxs("strong", { children: ["#", task?.ticket.id ?? worker.taskId] }), _jsx("p", { children: queuedIdle ? `Root idle · ${inbox.nextTurn ?? 0} queued next-turn messages · ${inbox.nextStep ?? 0} queued next-step messages` : `Root ${worker.lifecycle?.status ?? 'status unavailable'} · ${activity}` }), queuedIdle && _jsx("p", { className: css.muted, children: "Queued input is not proof of a running model stream. Capacity remains reserved until owned jobs, descendants, and the inbox are safely settled." }), queuedIdle && _jsxs("small", { children: ["Execution reservation: ", activity] }), worker.execution?.error && _jsxs("p", { className: css.error, role: "alert", children: ["Activity evidence failed: ", worker.execution.error] }), worker.coordination?.unfinishedTeamTasks !== undefined && _jsxs("small", { children: [worker.coordination.unfinishedTeamTasks, " unfinished original-team tasks \u00B7 phase ", worker.coordination.phase ?? 'unknown'] }), observedAt && _jsxs("small", { children: ["Observed ", new Date(observedAt).toLocaleString()] })] }, worker.taskId);
                                                    })] })] }), dirty && run?.status === 'stopped' && _jsx("p", { className: css.controlHint, children: "Save your configuration changes before resuming." }), _jsx("p", { className: css.controlHint, children: "Pause holds dispatch. Drain finishes active tickets. Finish existing tasks also keeps blocked/parked recovery available without new intake. Stop cancels active work. Unresolved blockers park after one hour, preserving work and freeing capacity." }), run?.intakeMode === 'existing-only' && _jsxs("p", { className: css.authorization, children: ["Existing tasks only: ", run.tasks.length, " admitted tickets. New admissions and follow-up issues are disabled until you explicitly allow new tickets."] }), run && _jsxs("section", { className: css.card, "aria-label": "Live intake policy", children: [_jsxs("div", { className: css.sectionTitle, children: [_jsx("h2", { children: "Live intake & review policy" }), _jsx("span", { children: policyEditable ? 'Running or paused coordinator controls' : 'Policy changes require a running or paused run' })] }), _jsxs("div", { className: css.fields, children: [_jsxs("label", { className: css.check, children: [_jsx("input", { "aria-label": "Live include tickets without a milestone", type: "checkbox", disabled: !policyEditable, checked: policy.includeUnmilestoned, onChange: event => setPolicyValue('includeUnmilestoned', event.target.checked) }), "Include tickets without a milestone"] }), _jsxs("label", { className: css.check, children: [_jsx("input", { "aria-label": "Live include required predecessors outside the selected milestones", type: "checkbox", disabled: !policyEditable, checked: policy.includeRequiredPredecessors, onChange: event => setPolicyValue('includeRequiredPredecessors', event.target.checked) }), "Include required predecessors outside the selected milestones"] }), _jsxs("label", { children: ["Token budget per independent review session", _jsx("input", { "aria-label": "Live OCR token budget", required: true, type: "number", min: 1, step: 1, max: MAX_OCR_TOKENS_BUDGET, disabled: !policyEditable, value: policy.ocrMaxTokensBudget, onChange: event => setPolicyValue('ocrMaxTokensBudget', Number(event.target.value)) }), _jsx("small", { children: "Each review has its own budget; no shared pool across workers or the run." })] }), _jsxs("label", { children: ["Primary code review", _jsxs("select", { "aria-label": "Live primary review backend", disabled: !policyEditable, value: policy.reviewBackend, onChange: event => setPolicyValue('reviewBackend', event.target.value), children: [_jsx("option", { value: "agent", children: "Independent agent" }), _jsx("option", { value: "ocr", children: "OpenCodeReview" })] })] }), _jsxs("label", { className: css.check, children: [_jsx("input", { "aria-label": "Live optional OCR check", type: "checkbox", disabled: !policyEditable, checked: policy.ocrAdditionalCheck, onChange: event => setPolicyValue('ocrAdditionalCheck', event.target.checked) }), "Optional additional OCR check"] }), _jsx("p", { className: css.muted, children: "Milestone order sets priority; dependencies still gate dispatch. Intake changes apply to new dispatch. Budget changes apply to future OCR review sessions." }), _jsx("button", { type: "button", disabled: !policyEditable || !validReviewBudget(policy.ocrMaxTokensBudget), onClick: () => void mutate('policy'), children: "Apply policy" })] })] }), run && _jsxs("section", { className: css.card, children: [_jsxs("div", { className: css.sectionTitle, children: [_jsx("h2", { children: "Backlog recovery" }), _jsxs("span", { children: [run.tasks.filter(t => t.status === 'parked').length, " parked / threshold ", run.config.parkedRecoveryThreshold ?? 4] })] }), _jsx("p", { children: run.backlogHold ? run.backlogHold.reason : 'New ticket intake is protected when parked work exceeds the threshold.' }), run.recoveryCampaign && _jsxs(_Fragment, { children: [_jsx("p", { className: css.authorization, children: "One dedicated recovery session examines shared CI, review, plugin and environment causes. It does not create a ticket or waive delivery gates." }), _jsxs("div", { className: css.links, children: [_jsx("button", { onClick: () => void navigate(run.recoveryCampaign.task.sessionId), children: "Recovery session \u2197" }), webUrl(run.recoveryCampaign.task.prUrl) && _jsx("a", { href: webUrl(run.recoveryCampaign.task.prUrl), target: "_blank", rel: "noreferrer", children: "Shared repair PR \u2197" }), _jsxs("span", { children: [run.recoveryCampaign.task.status, " \u00B7 ", run.recoveryCampaign.task.phase] })] }), _jsx("div", { className: css.phaseTotals, children: phaseDurations(run.recoveryCampaign.task, now).map(row => _jsxs("span", { children: [row.phase, _jsx("strong", { children: duration(row.milliseconds) })] }, row.phase)) }), run.recoveryCampaign.error && _jsx("p", { role: "alert", children: run.recoveryCampaign.error })] })] }), _jsxs("section", { className: css.card, children: [_jsxs("div", { className: css.sectionTitle, children: [_jsx("h2", { children: "Delivery queue" }), _jsx("span", { children: run?.lastPollAt ? `Last discovery ${new Date(run.lastPollAt).toLocaleTimeString()}` : 'Awaiting discovery' })] }), _jsx("div", { className: css.tableScroll, children: _jsxs("table", { children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Ticket / task" }), _jsx("th", { children: "Milestone" }), _jsx("th", { children: "Status" }), _jsx("th", { children: "Phase" }), _jsx("th", { children: "Elapsed" }), _jsx("th", { children: "Reviews" }), _jsx("th", { children: "Open" })] }) }), _jsx("tbody", { children: run?.tasks.map(item => _jsxs("tr", { "data-selected": selected === item.id, children: [_jsx("td", { children: _jsxs("button", { className: css.taskButton, onClick: () => setSelected(item.id), children: [_jsx("code", { children: item.ticket.id }), _jsx("strong", { children: item.ticket.title }), _jsx("small", { children: item.id })] }) }), _jsx("td", { children: item.ticket.milestone || 'Unassigned' }), _jsx("td", { children: _jsx("span", { className: css.status, "data-status": item.status, children: item.status }) }), _jsx("td", { children: item.phase }), _jsx("td", { className: css.numeric, children: duration(elapsedMs(item.startedAt, item.finishedAt, now)) }), _jsx("td", { className: css.numeric, children: item.reviewRounds }), _jsx("td", { children: _jsxs("div", { className: css.links, children: [item.sessionId && _jsx("button", { onClick: () => void navigate(item.sessionId), children: "Session \u2197" }), webUrl(item.prUrl) && _jsx("a", { href: webUrl(item.prUrl), target: "_blank", rel: "noreferrer", children: "PR \u2197" }), webUrl(item.ticket.url) && _jsx("a", { href: webUrl(item.ticket.url), target: "_blank", rel: "noreferrer", children: "Ticket \u2197" })] }) })] }, item.id)) })] }) }), !run?.tasks.length && _jsxs("div", { className: css.empty, children: [_jsx("span", { "aria-hidden": true, children: "\u2301" }), _jsx("h3", { children: run ? 'Watching the delivery queue' : 'Your next milestone starts here' }), _jsx("p", { children: run ? 'Tasks appear after the captain discovers and admits eligible tickets.' : 'Choose a source, order your milestones, then explicitly start the captain.' })] })] })] }), task && _jsxs("section", { className: css.card, children: [_jsxs("div", { className: css.sectionTitle, children: [_jsxs("h2", { children: [task.ticket.id, " \u00B7 Phase timeline"] }), !worker && _jsx("button", { onClick: () => setSelected(null), "aria-label": "Close task details", children: "\u2715" })] }), _jsx("div", { className: css.phaseTotals, children: phaseDurations(task, now).map(row => _jsxs("span", { children: [row.phase, _jsx("strong", { children: duration(row.milliseconds) })] }, row.phase)) }), _jsx("ol", { className: css.timeline, children: task.phases.map((event, index) => _jsxs("li", { children: [_jsx("time", { children: new Date(event.at).toLocaleTimeString() }), _jsx("strong", { children: event.phase }), event.note && _jsx("p", { children: event.note })] }, `${event.at}-${index}`)) }), _jsxs("div", { className: css.taskMetadata, children: [_jsxs("span", { children: ["Branch ", _jsx("code", { children: task.branch })] }), _jsxs("span", { children: ["Worktree ", _jsx("code", { children: task.worktree })] }), task.mergedSha && _jsxs("span", { children: ["Merged ", _jsx("code", { children: task.mergedSha })] })] }), task.workspaceError && _jsx("p", { role: "alert", children: task.workspaceError }), _jsx(CaptainReviewEvidence, { task: task }), task.parkingError && _jsxs("p", { role: "alert", children: ["Parking could not quiesce execution: ", task.parkingError, ". Capacity remains reserved."] }), !worker && (task.status === 'parked' || task.status === 'blocked' || task.status === 'running' && task.phase === 'waiting' || task.status === 'failed' && task.phase === 'blocked' && task.error === 'Task time budget exhausted' && !!task.finishedAt) && _jsxs("form", { className: css.fields, onSubmit: event => { event.preventDefault(); void resumeParked(task); }, children: [_jsxs("label", { children: ["Reason to retry (for example, solved)", _jsx("textarea", { required: true, value: resumeEvidence, onChange: e => setResumeEvidence(e.target.value) })] }), _jsx("small", { children: task.status === 'failed' ? `Authorizes one new bounded window of ${task.assignmentConfig?.maxTaskMinutes ?? run?.config.maxTaskMinutes} minutes. Original elapsed history and all verification gates remain.` : 'A human Resume authorizes one normal retry. Actual results still determine verification.' }), _jsx("button", { disabled: busy || run?.status !== 'running' || !!task.executionActive || !!task.parkingError || !resumeEvidence.trim(), children: task.status === 'failed' ? 'Authorize one new bounded window' : task.status === 'parked' ? 'Resume this parked task' : 'Retry this task' })] })] }), _jsxs("div", { className: css.lowerGrid, children: [!worker && _jsxs("section", { className: css.card, children: [_jsxs("div", { className: css.sectionTitle, children: [_jsx("h2", { children: "Eligibility & dependencies" }), _jsxs("span", { children: [eligibility.length, " tickets"] })] }), _jsx(CaptainEligibilityGraph, { tickets: run?.tickets ?? [], rows: eligibility }), !eligibility.length && _jsx("p", { className: css.placeholder, children: "Discovery decisions will appear here." })] }), _jsxs("section", { className: css.card, children: [_jsxs("div", { className: css.sectionTitle, children: [_jsx("h2", { children: "Blockers & decisions" }), _jsx("span", { children: "Orchestrator managed" })] }), _jsxs("ul", { className: css.records, children: [blockers.map(item => _jsxs("li", { children: [_jsxs("strong", { children: [item.ticket.id, " \u00B7 ", item.status] }), _jsx("p", { children: item.error ?? 'Waiting for the captain to resolve this blocker.' })] }, item.id)), run?.questions.map(question => _jsxs("li", { children: [_jsxs("small", { children: [question.taskId, " \u00B7 ", new Date(question.createdAt).toLocaleTimeString()] }), _jsx("strong", { children: question.question }), _jsx("p", { className: question.answer ? css.answer : css.muted, children: question.answer ?? 'Orchestrator is preparing an automatic answer…' }), question.answer && _jsx("small", { children: question.recordedAt ? 'Waiting decision recorded; worker not woken' : question.deliveredAt ? 'Delivered to worker' : 'Answer queued for delivery' }), question.deliveryError && _jsxs("small", { children: ["Delivery deferred: ", question.deliveryError] })] }, question.id))] }), !blockers.length && !run?.questions.length && _jsx("p", { className: css.placeholder, children: "No blockers or worker questions recorded." })] })] }), _jsxs("footer", { className: css.footer, children: [_jsx("span", { className: css.liveDot }), "Refreshes every 3 seconds while open", _jsx("span", { children: run ? `Run ${run.id}` : 'Automation is disabled' })] })] })] })] });
}
