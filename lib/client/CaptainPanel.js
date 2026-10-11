import { jsxs as _jsxs, jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
/** Native sidebar content. Mounting never enables automation or captures chat focus. */
import { useCallback, useEffect, useRef, useState } from 'react';
import css from './CaptainPanel.module.css';
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
    return _jsxs("article", { className: css.reviewRecord, children: [_jsxs("div", { className: css.reviewHeading, children: [_jsxs("strong", { children: ["Review ", index + 1] }), _jsx("span", { className: css.status, "data-status": review.passed ? 'ready' : 'failed', children: review.passed ? 'Passed at review' : 'Failed' }), _jsxs("span", { children: [review.findings.length, " ", review.findings.length === 1 ? 'finding' : 'findings'] }), _jsx("a", { href: download, download: filename, "aria-disabled": !download, children: "Download JSON \u2193" })] }), _jsxs("div", { className: css.reviewMetadata, children: [_jsx("time", { dateTime: review.at, children: new Date(review.at).toLocaleString() }), _jsxs("span", { children: ["Reviewed commit ", _jsx("code", { children: review.headSha || 'Unavailable' })] })] }), review.findings.length > 0 && _jsx("ul", { className: css.findings, children: review.findings.map((finding, findingIndex) => _jsx("li", { children: finding }, findingIndex)) }), _jsxs("details", { children: [_jsx("summary", { children: "Report excerpt" }), _jsx("pre", { children: review.report ? review.report.slice(0, 4000) : 'No report text was returned.' }), review.report.length > 4000 && _jsx("p", { className: css.muted, children: "Showing the first 4,000 characters. Download JSON for the complete report." })] })] });
}
export function CaptainReviewEvidence({ task }) {
    return _jsxs("div", { className: css.reviewEvidence, children: [_jsx("h3", { children: "Review evidence" }), _jsx("p", { className: css.muted, children: "Results describe the recorded commit at review time. Later branch changes require a new review." }), task.reviewHistory?.length ? task.reviewHistory.map((review, index) => _jsx(ReviewEvidenceRow, { task: task, review: review, index: index }, `${review.at}-${index}`)) : _jsx("p", { className: css.placeholder, children: "No independent review has been recorded yet." })] });
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
    return { provider: 'github', repository: '', workspace, milestones: [], remote: '', targetBranch: '', parallelism: 2, maxTickets: 0, maxTeamMembers: 4, pollSeconds: 30, maxRepairRounds: 3, maxTaskMinutes: 120, verifyCommands: [], workerPreset: 'standard', requireBrowser: false, requireMemory: false };
}
function lines(value) { return value.split(/\r?\n/).map(line => line.trim()).filter(Boolean); }
function terminal(task) { return ['merged', 'failed', 'cancelled'].includes(task.status); }
async function request(url, signal, body) {
    const response = await fetch(url, { signal, credentials: 'same-origin', ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
    const value = await response.json().catch(() => null);
    if (!response.ok) {
        const detail = value && typeof value === 'object' && 'error' in value ? String(value.error) : response.statusText;
        throw new Error(`${response.status}: ${detail || 'DarKingDoom Plugin request failed'}`);
    }
    return value;
}
export function CaptainPanel({ sessionId, workspace, onClose, openSession }) {
    const [snapshot, setSnapshot] = useState({ run: null });
    const [config, setConfig] = useState(() => defaults(workspace));
    const [milestones, setMilestones] = useState('');
    const [commands, setCommands] = useState('');
    const [busy, setBusy] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [repository, setRepository] = useState(null);
    const [contextLoading, setContextLoading] = useState(true);
    const [source, setSource] = useState();
    const [view, setView] = useState('configuration');
    const [error, setError] = useState(null);
    const [now, setNow] = useState(Date.now());
    const [selected, setSelected] = useState(null);
    const [parallelism, setParallelism] = useState(2);
    const controller = useRef(null);
    const generation = useRef(0);
    const mutation = useRef(false);
    const hydrated = useRef(null);
    const commandsEdited = useRef(false);
    const run = snapshot.run;
    const allowed = captainActionAvailability(run?.status, loaded, busy);
    const task = run?.tasks.find(item => item.id === selected);
    const set = (key, value) => setConfig(previous => ({ ...previous, [key]: value }));
    useEffect(() => {
        if (!loaded || run)
            return;
        const abort = new AbortController();
        setContextLoading(true);
        void request(`/api/darkingdoom/context?sessionId=${encodeURIComponent(sessionId)}${source ? `&provider=${source}` : ''}`, abort.signal).then(value => {
            if (abort.signal.aborted || hydrated.current)
                return;
            setRepository(value);
            setConfig(previous => ({ ...previous, provider: value.config.provider, workspace: value.config.workspace, repository: value.config.repository, organization: value.config.organization, project: value.config.project, remote: value.config.remote, targetBranch: value.config.targetBranch, query: undefined }));
            setMilestones(value.config.milestones.join('\n'));
            if (!commandsEdited.current)
                setCommands(value.config.verifyCommands.join('\n'));
        }).catch(cause => { if (!abort.signal.aborted) {
            setRepository(null);
            setError(String(cause instanceof Error ? cause.message : cause));
        } })
            .finally(() => { if (!abort.signal.aborted)
            setContextLoading(false); });
        return () => abort.abort();
    }, [loaded, !!run, sessionId, source]);
    const refresh = useCallback(async (signal) => {
        const version = ++generation.current;
        const value = await request(`/api/darkingdoom/state?sessionId=${encodeURIComponent(sessionId)}`, signal);
        if (!value || typeof value !== 'object' || !('run' in value))
            throw new Error('DarKingDoom Plugin returned an invalid state');
        if (signal.aborted || version !== generation.current)
            return;
        setSnapshot(value);
        setLoaded(true);
        if (value.run && hydrated.current !== value.run.id) {
            hydrated.current = value.run.id;
            setConfig(value.run.config);
            setMilestones(value.run.config.milestones.join('\n'));
            setCommands(value.run.config.verifyCommands.join('\n'));
            setParallelism(value.run.config.parallelism);
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
                        setError(String(cause instanceof Error ? cause.message : cause));
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
        mutation.current = true;
        generation.current++;
        setBusy(true);
        try {
            await request(action ? '/api/darkingdoom/control' : '/api/darkingdoom/start', signal, action
                ? { sessionId, action, ...(action === 'parallelism' ? { parallelism } : {}) }
                : { sessionId, config: { ...config, milestones: lines(milestones), verifyCommands: lines(commands) } });
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
    function start(event) { event.preventDefault(); void mutate(); }
    async function navigate(childId) {
        try {
            await openSession(sessionId, childId);
        }
        catch (cause) {
            setError(`Could not open worker session: ${String(cause)}`);
        }
    }
    const merged = run?.tasks.filter(item => item.status === 'merged').length ?? 0;
    const working = run?.tasks.filter(item => !terminal(item)).length ?? 0;
    const blockers = run?.tasks.filter(item => item.error || item.status === 'blocked' || item.status === 'failed') ?? [];
    const totalTaskTime = run?.tasks.reduce((sum, item) => sum + elapsedMs(item.startedAt, item.finishedAt, now), 0) ?? 0;
    const eligibility = snapshot.eligibility ?? run?.tickets.map(ticket => {
        const existing = run.tasks.find(item => item.ticket.id === ticket.id);
        return { ticketId: ticket.id, eligible: false, reason: existing ? `Task ${existing.status}` : ticket.exclusion ?? (ticket.merged ? 'Already merged' : ticket.state === 'closed' ? 'Closed' : 'Awaiting captain eligibility evaluation') };
    }) ?? [];
    return _jsxs("section", { className: css.panel, role: "region", "aria-labelledby": "darkingdoom-title", "data-darkingdoom": true, children: [_jsxs("header", { className: css.header, children: [_jsxs("div", { className: css.heading, children: [_jsx("span", { className: css.mark, "aria-hidden": true, children: "\u2301" }), _jsxs("div", { children: [_jsx("span", { className: css.eyebrow, children: "AUTONOMOUS DELIVERY" }), _jsx("h1", { id: "darkingdoom-title", children: "DarKingDoom Plugin" })] }), _jsx("span", { className: css.status, "data-status": run?.status ?? 'idle', children: run?.status ?? 'Not started' })] }), _jsx("button", { type: "button", onClick: onClose, "aria-label": "Close DarKingDoom Plugin", children: "\u2715" })] }), _jsxs("div", { className: css.owner, children: ["Session ", _jsx("code", { children: sessionId }), _jsx("span", { children: "Opening this panel never starts a run." })] }), error && _jsxs("div", { className: css.error, role: "alert", children: [_jsx("span", { children: error }), _jsx("button", { type: "button", onClick: () => setError(null), children: "Dismiss" })] }), run?.error && _jsxs("div", { className: css.error, role: "alert", children: ["Captain: ", run.error] }), _jsxs("nav", { className: css.views, "aria-label": "Plugin view", children: [_jsx("button", { type: "button", "aria-pressed": view === 'configuration', onClick: () => setView('configuration'), children: "Configuration" }), _jsx("button", { type: "button", "aria-pressed": view === 'monitor', onClick: () => setView('monitor'), children: "Monitor" })] }), _jsxs("div", { className: css.body, children: [_jsxs("aside", { hidden: view !== 'configuration', className: css.configuration, children: [_jsxs("div", { className: css.sectionTitle, children: [_jsx("h2", { children: "Run configuration" }), _jsx("span", { children: run ? 'Saved run configuration' : contextLoading ? 'Loading repository configuration…' : 'From the current session repository' })] }), !run && repository?.warnings.map((warning, index) => _jsx("p", { className: css.muted, children: warning }, index)), _jsxs("form", { onSubmit: start, children: [_jsxs("fieldset", { disabled: !!run || busy || !loaded, className: css.fields, children: [_jsxs("label", { children: ["Ticket source", _jsxs("select", { disabled: contextLoading && loaded, value: config.provider, onChange: event => { setContextLoading(true); setSource(event.target.value); }, children: [_jsx("option", { value: "github", disabled: repository ? !repository.providers.includes('github') : false, children: "GitHub Issues" }), _jsx("option", { value: "azure", disabled: repository ? !repository.providers.includes('azure') : false, children: "Azure DevOps" })] })] }), _jsxs("label", { children: ["Repository", _jsx("input", { required: true, readOnly: true, value: config.repository, placeholder: "Detected from this session" })] }), _jsxs("label", { children: ["Workspace", _jsx("input", { required: true, readOnly: true, value: config.workspace, placeholder: "Current session repository" })] }), config.provider === 'azure' && _jsxs(_Fragment, { children: [_jsxs("label", { children: ["Organization URL", _jsx("input", { required: true, readOnly: true, value: config.organization ?? '' })] }), _jsxs("label", { children: ["Project", _jsx("input", { required: true, readOnly: true, value: config.project ?? '' })] })] }), _jsxs("label", { children: ["Query ", _jsx("span", { className: css.optional, children: "(optional)" }), _jsx("textarea", { rows: 2, value: config.query ?? '', onChange: event => set('query', event.target.value), placeholder: config.provider === 'azure' ? 'WIQL query' : 'Additional issue search filters' })] }), _jsxs("label", { children: ["Milestones, in delivery order", _jsx("textarea", { disabled: contextLoading, required: true, rows: 3, value: milestones, onChange: event => setMilestones(event.target.value), placeholder: "Detected delivery milestones" }), _jsx("small", { children: repository?.milestoneSource || 'One exact milestone name per line.' })] }), _jsxs("div", { className: css.pair, children: [_jsxs("label", { children: ["Remote", _jsx("input", { required: true, readOnly: true, value: config.remote })] }), _jsxs("label", { children: ["Target branch", _jsx("input", { required: true, readOnly: true, value: config.targetBranch })] })] }), _jsxs("div", { className: css.pair, children: [_jsxs("label", { children: ["Parallel tickets", _jsx("input", { required: true, type: "number", min: 1, max: 32, value: config.parallelism, onChange: event => set('parallelism', Number(event.target.value)) })] }), _jsxs("label", { children: ["Members / team", _jsx("input", { required: true, type: "number", min: 1, max: 16, value: config.maxTeamMembers, onChange: event => set('maxTeamMembers', Number(event.target.value)) })] })] }), _jsxs("label", { children: ["Verification commands", _jsx("textarea", { disabled: contextLoading, required: true, rows: 3, value: commands, onChange: event => { commandsEdited.current = true; setCommands(event.target.value); }, placeholder: "Detected repository checks" }), _jsx("small", { children: repository?.verificationSource || 'One host command per line, run in each task worktree.' })] }), _jsxs("details", { children: [_jsx("summary", { children: "Execution limits & verification" }), _jsxs("div", { className: css.fields, children: [_jsxs("div", { className: css.pair, children: [_jsxs("label", { children: ["Poll seconds", _jsx("input", { required: true, type: "number", min: 5, max: 3600, value: config.pollSeconds, onChange: event => set('pollSeconds', Number(event.target.value)) })] }), _jsxs("label", { children: ["Repair rounds", _jsx("input", { required: true, type: "number", min: 0, max: 20, value: config.maxRepairRounds, onChange: event => set('maxRepairRounds', Number(event.target.value)) })] })] }), _jsxs("label", { children: ["Task timeout (minutes)", _jsx("input", { required: true, type: "number", min: 1, max: 1440, value: config.maxTaskMinutes, onChange: event => set('maxTaskMinutes', Number(event.target.value)) })] }), _jsxs("label", { children: ["Ticket limit", _jsx("input", { required: true, type: "number", min: 0, max: 100000, value: config.maxTickets ?? 0, onChange: event => set('maxTickets', Number(event.target.value)) }), _jsx("small", { children: "0 keeps consuming; 1 runs a single-ticket trial. Attempts count toward the limit." })] }), _jsxs("label", { children: ["Worker preset", _jsx("input", { required: true, value: config.workerPreset, onChange: event => set('workerPreset', event.target.value) })] }), _jsxs("label", { className: css.check, children: [_jsx("input", { type: "checkbox", checked: config.requireMemory, onChange: event => set('requireMemory', event.target.checked) }), "Require durable memory"] }), _jsxs("label", { className: css.check, children: [_jsx("input", { type: "checkbox", checked: config.requireBrowser, onChange: event => set('requireBrowser', event.target.checked) }), "Require browser verification"] })] })] })] }), _jsx("p", { className: css.authorization, children: "Start authorizes full access execution, autonomous repair, review, merge and ticket closure within this configuration. The captain answers worker questions automatically." }), _jsx("button", { type: "submit", className: css.primary, disabled: !allowed.start || contextLoading || !repository || !config.targetBranch || !lines(milestones).length || lines(milestones).some(name => !repository.milestoneCatalog.includes(name)) || !lines(commands).length, children: busy ? 'Applying…' : run ? 'Run already created' : 'Start DarKingDoom Plugin' }), run?.status === 'stopped' && _jsx("p", { className: css.muted, children: "Use Resume to continue this saved run with its existing tasks and claims." }), !loaded && _jsx("p", { className: css.muted, children: "Loading saved run before enabling Start\u2026" })] })] }), _jsxs("main", { hidden: view !== 'monitor', className: css.monitor, children: [_jsxs("div", { className: css.metrics, children: [_jsxs("div", { children: [_jsx("span", { children: "Wall time" }), _jsx("strong", { children: run ? duration(elapsedMs(run.createdAt, run.status === 'stopped' ? run.updatedAt : undefined, now)) : '—' }), _jsx("small", { children: "Includes waiting & pauses" })] }), _jsxs("div", { children: [_jsx("span", { children: "Working / parallel limit" }), _jsxs("strong", { children: [working, _jsxs("em", { children: [" / ", run?.config.parallelism ?? config.parallelism] })] }), _jsxs("small", { children: [merged, " merged \u00B7 ", run?.tickets.length ?? 0, " discovered"] })] }), _jsxs("div", { children: [_jsx("span", { children: "Task elapsed, summed" }), _jsx("strong", { children: run ? duration(totalTaskTime) : '—' }), _jsx("small", { children: "Overlaps; includes waiting" })] }), _jsxs("div", { children: [_jsx("span", { children: "Active agent effort" }), _jsx("strong", { className: css.unmeasured, children: "Not measured" }), _jsx("small", { children: "No runtime effort telemetry" })] })] }), _jsxs("div", { className: css.controls, "aria-label": "Run controls", children: [_jsx("button", { disabled: !allowed.pause, onClick: () => void mutate('pause'), children: "Pause" }), _jsx("button", { disabled: !allowed.resume, onClick: () => void mutate('resume'), children: "Resume" }), _jsx("button", { disabled: !allowed.drain, onClick: () => void mutate('drain'), title: "Finish active work without taking more tickets", children: "Drain" }), _jsx("button", { className: css.danger, disabled: !allowed.stop, onClick: () => void mutate('stop'), children: "Stop" }), _jsxs("label", { children: ["Parallelism", _jsx("input", { "aria-label": "Live parallelism", type: "number", min: 1, max: 32, value: parallelism, disabled: !allowed.parallelism, onChange: event => setParallelism(Number(event.target.value)) })] }), _jsx("button", { disabled: !allowed.parallelism || !Number.isInteger(parallelism) || parallelism < 1 || parallelism > 32, onClick: () => void mutate('parallelism'), children: "Apply" })] }), _jsx("p", { className: css.controlHint, children: "Pause holds new dispatch. Drain finishes active tickets. Stop cancels active work." }), _jsxs("section", { className: css.card, children: [_jsxs("div", { className: css.sectionTitle, children: [_jsx("h2", { children: "Delivery queue" }), _jsx("span", { children: run?.lastPollAt ? `Last discovery ${new Date(run.lastPollAt).toLocaleTimeString()}` : 'Awaiting discovery' })] }), _jsx("div", { className: css.tableScroll, children: _jsxs("table", { children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Ticket / task" }), _jsx("th", { children: "Milestone" }), _jsx("th", { children: "Status" }), _jsx("th", { children: "Phase" }), _jsx("th", { children: "Elapsed" }), _jsx("th", { children: "Reviews" }), _jsx("th", { children: "Open" })] }) }), _jsx("tbody", { children: run?.tasks.map(item => _jsxs("tr", { "data-selected": selected === item.id, children: [_jsx("td", { children: _jsxs("button", { className: css.taskButton, onClick: () => setSelected(item.id), children: [_jsx("code", { children: item.ticket.id }), _jsx("strong", { children: item.ticket.title }), _jsx("small", { children: item.id })] }) }), _jsx("td", { children: item.ticket.milestone }), _jsx("td", { children: _jsx("span", { className: css.status, "data-status": item.status, children: item.status }) }), _jsx("td", { children: item.phase }), _jsx("td", { className: css.numeric, children: duration(elapsedMs(item.startedAt, item.finishedAt, now)) }), _jsx("td", { className: css.numeric, children: item.reviewRounds }), _jsx("td", { children: _jsxs("div", { className: css.links, children: [item.sessionId && _jsx("button", { onClick: () => void navigate(item.sessionId), children: "Session \u2197" }), webUrl(item.prUrl) && _jsx("a", { href: webUrl(item.prUrl), target: "_blank", rel: "noreferrer", children: "PR \u2197" }), webUrl(item.ticket.url) && _jsx("a", { href: webUrl(item.ticket.url), target: "_blank", rel: "noreferrer", children: "Ticket \u2197" })] }) })] }, item.id)) })] }) }), !run?.tasks.length && _jsxs("div", { className: css.empty, children: [_jsx("span", { "aria-hidden": true, children: "\u2301" }), _jsx("h3", { children: run ? 'Watching the delivery queue' : 'Your next milestone starts here' }), _jsx("p", { children: run ? 'Tasks appear after the captain discovers and admits eligible tickets.' : 'Choose a source, order your milestones, then explicitly start the captain.' })] })] }), task && _jsxs("section", { className: css.card, children: [_jsxs("div", { className: css.sectionTitle, children: [_jsxs("h2", { children: [task.ticket.id, " \u00B7 Phase timeline"] }), _jsx("button", { onClick: () => setSelected(null), "aria-label": "Close task details", children: "\u2715" })] }), _jsx("div", { className: css.phaseTotals, children: phaseDurations(task, now).map(row => _jsxs("span", { children: [row.phase, _jsx("strong", { children: duration(row.milliseconds) })] }, row.phase)) }), _jsx("ol", { className: css.timeline, children: task.phases.map((event, index) => _jsxs("li", { children: [_jsx("time", { children: new Date(event.at).toLocaleTimeString() }), _jsx("strong", { children: event.phase }), event.note && _jsx("p", { children: event.note })] }, `${event.at}-${index}`)) }), _jsxs("div", { className: css.taskMetadata, children: [_jsxs("span", { children: ["Branch ", _jsx("code", { children: task.branch })] }), _jsxs("span", { children: ["Worktree ", _jsx("code", { children: task.worktree })] }), task.mergedSha && _jsxs("span", { children: ["Merged ", _jsx("code", { children: task.mergedSha })] })] }), _jsx(CaptainReviewEvidence, { task: task })] }), _jsxs("div", { className: css.lowerGrid, children: [_jsxs("section", { className: css.card, children: [_jsxs("div", { className: css.sectionTitle, children: [_jsx("h2", { children: "Eligibility" }), _jsxs("span", { children: [eligibility.length, " tickets"] })] }), _jsx("ul", { className: css.records, children: eligibility.map(row => _jsxs("li", { children: [_jsx("code", { children: row.ticketId }), _jsx("span", { className: css.status, "data-status": row.eligible ? 'ready' : 'waiting', children: row.eligible ? 'Eligible' : 'Held' }), _jsx("p", { children: row.reason })] }, row.ticketId)) }), !eligibility.length && _jsx("p", { className: css.placeholder, children: "Discovery decisions will appear here." })] }), _jsxs("section", { className: css.card, children: [_jsxs("div", { className: css.sectionTitle, children: [_jsx("h2", { children: "Blockers & decisions" }), _jsx("span", { children: "Orchestrator managed" })] }), _jsxs("ul", { className: css.records, children: [blockers.map(item => _jsxs("li", { children: [_jsxs("strong", { children: [item.ticket.id, " \u00B7 ", item.status] }), _jsx("p", { children: item.error ?? 'Waiting for the captain to resolve this blocker.' })] }, item.id)), run?.questions.map(question => _jsxs("li", { children: [_jsxs("small", { children: [question.taskId, " \u00B7 ", new Date(question.createdAt).toLocaleTimeString()] }), _jsx("strong", { children: question.question }), _jsx("p", { className: question.answer ? css.answer : css.muted, children: question.answer ?? 'Orchestrator is preparing an automatic answer…' }), question.answer && _jsx("small", { children: question.deliveredAt ? 'Delivered to worker' : 'Answer queued for delivery' })] }, question.id))] }), !blockers.length && !run?.questions.length && _jsx("p", { className: css.placeholder, children: "No blockers or worker questions recorded." })] })] }), _jsxs("footer", { className: css.footer, children: [_jsx("span", { className: css.liveDot }), "Refreshes every 3 seconds while open", _jsx("span", { children: run ? `Run ${run.id}` : 'Automation is disabled' })] })] })] })] });
}
