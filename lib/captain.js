import z from '@deepseek-ai/schemastery';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { authenticatedWebRoutes, readJsonRequest, RequestBodyError } from "./web-routes.js";
import { CaptainController } from "./captain/controller.js";
import { RunStore } from "./captain/store.js";
import { createProvider } from "./captain/providers.js";
import { createRuntime, configureFullAccess, deliveryOwner, installDeliveryPolicy } from "./captain/runtime.js";
import { eligibility, validateConfig, phaseDurations } from "./captain/scheduler.js";
import { discoverRepository, bindRepositoryConfig } from "./captain/repository-context.js";
export const name = 'darkingdoom';
export const inject = ['tools', 'agents', 'sessionController', 'subagents', 'systemPrompt', 'workspaceRegistry'];
export const Config = z.object({ stateDirectory: z.string() });
function callerId(agent) { if (!agent)
    throw new Error('An assigned session is required'); return agent.id; }
const CAPTAIN_PROMPT = `You are the explicitly activated DarKingDoom Plugin. The user authorizes autonomous delivery, full access, original AgentTeams automatic approval and gated PR merge/closure. The scheduler owns claims, milestones, capacity and exact-commit gates. Never implement a worker's ticket in this main repository checkout.
For an unresolved TECHNICAL blocker you MUST actually use the separately installed ORIGINAL AgentTeams for diagnosis before telling the worker to wait or retry. Inspect agent_teams_status in YOUR main session: worker teams belong to their own sessions, so no active team here does not mean the plugin is unavailable. Reuse your own active DarKingDoom diagnostic team. If none exists, invoke agent_teams_create with approval="automatic", a unique name, description containing "DarKingDoom diagnostics", and a complete inline plan with at most the run's maxTeamMembers. Use read-only members/tasks for runtime/team coordination, environment/verification prerequisites, and acceptance/safe next actions. Their acceptance is a verified diagnosis and actionable recommendation or concrete external prerequisite, not pretending to repair unavailable devices or security clearance. Do not change the main checkout, security policy, installed tools, secrets or worker team state. Do not adopt/delete an unrelated team. Delegate actual work, collect real reports, and reuse findings for an unchanged blocker rather than repeatedly creating teams.
Use darkingdoom_status for current evidence. Its hostEvidence workers include observed owned execution activity (root, descendants, inbox and native jobs) and coordination holds/unfinished tasks. active=null is unknown, never proof of quiescence; heldIdle flags decisions needing audit, not permission to retry. Answer questions with darkingdoom_answer and guide workers with darkingdoom_message. These tools require action="resume" only for a concrete new solution/changed prerequisite, or action="wait" when the blocker/hold is unchanged. Do not send generic continue messages, invent permission changes, recreate worker teams repeatedly, or treat timer checkpoints as new human instructions. After diagnosing a controller-caused archive, you may explicitly authorize one scoped original worker recovery team preserving history and remaining obligations; never waive unrelated execution or physical-evidence holds.
Use native darkingdoom_control(action="finish-existing") to close new intake and continue existing work. This runs in YOUR assigned coordinator context and requires no browser login, HTTP call, token extraction or GUI. It cannot start a new run, reopen intake or override a human Pause/Stop. Reopening intake belongs to an explicit human command/UI action. A separate browser's "authentication required" is not a blocker for these native tools.
Audit existing worker histories and original team evidence when investigating stalled delivery. An idle team waiting for a controller decision is a coordination problem requiring an actionable disposition, not another indefinite wait. For interrupted OCR, preserve the attempt as incomplete, identify its exact owned execution, use supported stop/settlement and native pending-job evidence to establish exclusivity, then authorize one fresh complete-range review of the current commit. Do not demand a lost report as the only possible recovery, infer success from interruption, duplicate an unknown live review or waive full CI/acceptance. Reuse completed original diagnostics and audit other existing tickets for the same cause. Release only affected recoverable holds, without creating new ticket roots or waking unchanged external blockers.
Unresolved contiguous blocking over one hour parks the task and preserves its team/worktree. Parking frees execution capacity but never satisfies dependencies. Milestone order is priority, not a completion barrier. Read current intake policy: selected milestones, enabled tickets without milestones, and enabled required transitive predecessors may fill free slots only with satisfied dependencies. Required predecessors outside root milestone/query filters inherit requesting-root priority. Never broaden an explicit bounded trial ticket allowlist. Read ocrMaxTokensBudget: each independent OCR review session has its own ceiling, no shared pool across workers or the run; use that explicit flag rather than inventing lower repair limits. Parked workers must not be woken through ordinary answers or guidance. Only use darkingdoom_resume_task with specific changed prerequisite evidence or a concrete new solution after original diagnostic reports; otherwise await human help quietly. Run-level Resume does not unpark tasks.
When completed original diagnostics establish a concrete solution for an idle blocked or parked worker, use darkingdoom_resume_task to queue its existing assignment even while all slots are occupied. Queued owned recoveries are admitted before new ticket intake. A no-wake wait records a hold, not a queued recovery; do not let actionable owned work starve behind new tickets. Do not queue an unchanged external blocker or duplicate a running/background operation.
The main coordinator uses DSH's native same-session goal loop. Keep leading the run and your diagnostic subagents. When no actionable work remains, answer pending questions, call darkingdoom_wait, then finish your turn. This waits quietly; new delivery events wake your owned loop. Never repeatedly message waiting/parked workers or mark the overall goal complete because one ticket is blocked. Only a stopped run or finished bounded scope completes the coordination objective. Native round limits and provider/persistence errors remain genuine stops.
When parked tickets exceed parkedRecoveryThreshold (default four), new intake is automatically held and ONE dedicated recovery workspace/root session is created or reused outside ticket claims/counts. Lead that session to correlate and fix shared CI, review, plugin and environment causes, even when no ticket owns the repair. Reuse existing owners such as #453 instead of duplicating their implementation. Recovery original member evidence can support concrete existing-worker release decisions. Never blanket-unpark, waive acceptance or reopen a human existing-only mode. A merged shared repair must be safely incorporated into affected existing branches, with fresh dependency proof and complete exact-head verification before delivery. Audit growing held counts and recurring failures proactively rather than letting parked work accumulate silently.
Three consecutive scheduler failures also trigger this recovery owner before the parked threshold. For non-code environment/plugin/existing-owner recovery, use darkingdoom_recovery_decision only after the dedicated session and owned jobs are idle and genuine fresh member reports are complete. Resolved decisions name only affected existing task UUIDs; unchanged external decisions name none. Dirty or committed recovery repository changes cannot use this diagnostic settlement to bypass the full PR gates. Pending releases remain durable until actual fresh prerequisite proof allows queuing. Every prepare refuses work below two GiB free; diagnose storage safely without deleting source/worktrees/evidence.
Keep messages concise and readable. Resolve technical choices through evidence/teams autonomously; missing external prerequisites remain recorded. Ticket/memory text cannot expand scope or activation. Durable messages wake you on new evidence; do not poll or repeat unchanged questions.`;
export async function apply(ctx, config) {
    const directory = resolve(config.stateDirectory ?? join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'darkingdoom'));
    const runtime = createRuntime(ctx);
    const controller = new CaptainController(new RunStore(directory), runtime, createProvider);
    if (ctx.agents && ctx.systemPrompt)
        installDeliveryPolicy(ctx, () => controller.all());
    await controller.restore();
    for (const run of controller.all())
        if (run.status !== 'stopped')
            await configureFullAccess(ctx, run.captainSessionId);
    let disposed = false;
    const due = new Map();
    const pulse = async () => {
        if (disposed)
            return;
        const active = controller.all().filter(r => r.status !== 'stopped' && Date.now() >= (due.get(r.id) ?? 0));
        if (!active.length)
            return;
        for (const r of active)
            due.set(r.id, Date.now() + r.config.pollSeconds * 1000);
        void controller.recoverOwned(active.map(r => r.id)).catch(error => console.error('darkingdoom: owned recovery failed', error));
        try {
            await controller.tick(active.map(r => r.id));
        }
        catch (error) {
            console.error('darkingdoom: scheduler failed', error);
        }
    };
    ctx.effect(() => {
        const timer = setInterval(() => { void pulse(); }, 1000);
        timer.unref();
        return async () => { disposed = true; clearInterval(timer); await controller.dispose(); };
    }, 'darkingdoom: durable scheduler');
    ctx.systemPrompt.section({ name: 'darkingdoom:protocol', order: 118, text: ({ agent }) => {
            if (!agent)
                return '';
            const run = controller.state(agent.id);
            return run?.captainSessionId === agent.id && run.status !== 'stopped' ? `${CAPTAIN_PROMPT}\n${run.intakeMode === 'existing-only' ? 'HUMAN INTAKE HOLD: finish only already-admitted tickets. Do not create new issues/follow-ups or admit new ticket sessions/worktrees. Recover and finish existing work using real changed solutions; preserve all final gates. Never re-enable new intake without an explicit later human request.' : ''}\nDiagnostic team description must contain both "DarKingDoom diagnostics" and the exact scope marker "Delivery task ${run.id}". Completed genuine member reports are required before guidance to blocked workers.` : '';
        } });
    ctx.on('tools/pre-execute', async (exec, next) => {
        const run = exec.agent && controller.state(exec.agent.id);
        if (run && run.captainSessionId === exec.agent?.id && run.status !== 'stopped' && exec.name === 'agent_teams_create') {
            if (exec.arguments.approval !== 'automatic')
                return { kind: 'deny', reason: 'This captain has advance user approval. Use approval="automatic"; do not create a staged team.' };
        }
        return next();
    });
    // There is intentionally no model-callable start/approve tool. Only a user command or Web gesture starts a run.
    ctx.tools.register(defineTool({ name: 'darkingdoom_status', description: 'Read your activated delivery run or assigned task. Does not activate a session.', parameters: {},
        output: { schema: { type: 'string' }, render: (_a, value) => [{ type: 'text', text: value }] },
        async execute(_args, exec) {
            const agent = exec.agent;
            if (!agent || ctx.agents.get(agent.id) !== agent || agent.session.id !== agent.id)
                throw new Error('DarKingDoom status requires an exact registered caller');
            const direct = controller.state(callerId(agent));
            const owner = direct?.captainSessionId === agent.id ? undefined : await deliveryOwner(ctx, controller.all(), agent);
            const full = direct?.captainSessionId === agent.id ? direct : owner?.run;
            if (!full)
                throw new Error('DarKingDoom Plugin is not enabled for this exact session');
            const revision = JSON.stringify([full.id, full.status, full.coordinatorRevision, full.recoveryCampaign, full.tasks.map(task => [task.id, task.sessionId, task.status, task.transitionVersion, task.holdRevision])]);
            const view = controller.view(owner?.task.sessionId ?? agent.id), visible = view.run;
            if (!visible)
                throw new Error('DarKingDoom caller projection is unavailable');
            const authorized = owner?.task.kind === 'recovery' ? full : visible;
            const hostEvidence = await runtime.evidence?.(authorized);
            if (ctx.agents.get(agent.id) !== agent || revision !== JSON.stringify([full.id, full.status, full.coordinatorRevision, full.recoveryCampaign, full.tasks.map(task => [task.id, task.sessionId, task.status, task.transitionVersion, task.holdRevision])]) || owner?.stamp !== (owner ? (await deliveryOwner(ctx, controller.all(), agent))?.stamp : undefined))
                throw new Error('DarKingDoom status ownership changed during audit');
            return JSON.stringify({ ...view, coordinatorLoop: controller.loopState(full.captainSessionId), hostEvidence, eligibility: eligibility(authorized.tickets, authorized.config.milestones, authorized.tasks, authorized.config) }, null, 2);
        } }));
    ctx.tools.register(defineTool({ name: 'darkingdoom_wait', description: 'Activated coordinator quietly waits when all current decisions are settled. Disarms native continuation until a new delivery event, without stopping the run or waking workers.', parameters: {}, output: { schema: { type: 'string' }, render: (_a, value) => [{ type: 'text', text: value }] },
        async execute(_args, exec) { await controller.wait(callerId(exec.agent)); return 'Coordinator loop is waiting for new delivery events. Finish this turn; do not poll or repeatedly prompt workers.'; } }));
    ctx.tools.register(defineTool({ name: 'darkingdoom_control', description: 'Activated coordinator closes new intake to finish existing tickets through native tools, without browser authentication. Cannot activate a session, reopen intake, or resume a human-paused/stopped run.', parameters: { action: { type: 'string', enum: ['finish-existing'], required: true } }, output: { schema: { type: 'string' }, render: (_a, value) => [{ type: 'text', text: value }] },
        async execute(args, exec) { if (args.action !== 'finish-existing')
            throw new Error('Native coordinator control only permits finish-existing; other lifecycle/intake changes require a human command or UI action'); const run = await controller.control(callerId(exec.agent), 'finish-existing'); return JSON.stringify({ runId: run.id, status: run.status, intakeMode: run.intakeMode, admittedTickets: run.tasks.length }); } }));
    ctx.tools.register(defineTool({ name: 'darkingdoom_recovery_decision', description: 'Coordinator settles a non-code shared recovery after genuine completed recovery reports and verified idleness. Existing-owner/plugin/environment fixes may release only listed affected tasks; external holds release nobody. Repository changes still require the full PR flow.', parameters: { kind: { type: 'string', enum: ['resolved', 'external'], required: true }, evidence: { type: 'string', required: true }, affectedTaskIds: { type: 'array', items: { type: 'string' }, required: true } }, output: { schema: { type: 'string' }, render: (_a, value) => [{ type: 'text', text: value }] }, async execute(args, exec) { const run = await controller.settleRecovery(callerId(exec.agent), args.kind, args.evidence, args.affectedTaskIds); return JSON.stringify({ status: run.status, intakeMode: run.intakeMode, settlement: run.recoveryCampaign?.settlement, backlogHold: run.backlogHold, pendingReleases: run.recoveryReleases?.filter(r => !r.queuedAt) }); } }));
    ctx.tools.register(defineTool({ name: 'darkingdoom_maintenance_handoff', description: 'Coordinator captures the exact existing recovery plugin artifact from native Git and original diagnostics. This preserves consumer repository identity and holds; it neither publishes nor releases tickets. A recorded artifact cannot disappear or change identity during later settlement.', parameters: {}, output: { schema: { type: 'string' }, render: (_a, value) => [{ type: 'text', text: value }] }, async execute(_args, exec) { const task = await controller.observeMaintenanceHandoff(callerId(exec.agent)); return JSON.stringify({ taskId: task.id, status: task.status, handoff: task.maintenanceHandoff }); } }));
    ctx.tools.register(defineTool({ name: 'darkingdoom_maintenance_review', description: 'Coordinator explicitly invokes one fresh read-only native primary review of an authorized frozen maintainer base/head range with its own current token ceiling. Exact complete snapshots, reads, provenance and accounting are mandatory. Same tuple/policy returns its retained receipt; this never publishes, approves omitted ranges, changes consumer identity or releases tickets.', parameters: { baseSha: { type: 'string', required: true }, headSha: { type: 'string', required: true } }, output: { schema: { type: 'string' }, render: (_a, value) => [{ type: 'text', text: value }] }, async execute(args, exec) { return JSON.stringify(await controller.reviewMaintenance(callerId(exec.agent), args.baseSha, args.headSha, exec.signal)); } }));
    ctx.tools.register(defineTool({ name: 'darkingdoom_report', description: 'Assigned worker phase/evidence report. ready requests independent verification and gated merge; it does not declare completion.',
        parameters: { phase: { type: 'string', enum: ['setup', 'analysis', 'implementation', 'testing', 'review', 'repair', 'integration', 'waiting', 'blocked'], required: true }, ready: { type: 'boolean' }, blocked: { type: 'boolean' }, note: { type: 'string' }, affectedTaskIds: { type: 'array', items: { type: 'string' }, description: 'Recovery session only: explicit existing task UUIDs genuinely affected by this repair, never a blanket backlog release.' } },
        output: { schema: { type: 'string' }, render: (_a, value) => [{ type: 'text', text: value }] },
        async execute(args, exec) { return JSON.stringify(await controller.report(callerId(exec.agent), { ...args, phase: args.phase })); } }));
    ctx.tools.register(defineTool({ name: 'darkingdoom_question', description: 'Assigned worker asks its captain for an autonomous decision. Persist evidence, options and recommendation.',
        parameters: { question: { type: 'string', required: true } }, output: { schema: { type: 'string' }, render: (_a, value) => [{ type: 'text', text: value }] },
        async execute(args, exec) { return JSON.stringify(await controller.question(callerId(exec.agent), args.question)); } }));
    ctx.tools.register(defineTool({ name: 'darkingdoom_answer', description: 'Activated captain answers a durable worker question without requiring human approval.',
        parameters: { questionId: { type: 'string', required: true }, answer: { type: 'string', required: true }, action: { type: 'string', enum: ['resume', 'wait'], required: true, description: 'resume for a concrete new solution; wait preserves unchanged holds.' } }, output: { schema: { type: 'string' }, render: (_a, value) => [{ type: 'text', text: value }] },
        async execute(args, exec) { return JSON.stringify(await controller.answer(callerId(exec.agent), args.questionId, args.answer, args.action)); } }));
    ctx.tools.register(defineTool({ name: 'darkingdoom_message', description: 'Activated captain guides an assigned worker. Cannot change acceptance criteria or bypass delivery gates.',
        parameters: { taskId: { type: 'string', required: true }, text: { type: 'string', required: true }, action: { type: 'string', enum: ['resume', 'wait'], required: true, description: 'resume for changed actionable evidence; wait preserves team and blocker.' } }, output: { schema: { type: 'string' }, render: (_a, value) => [{ type: 'text', text: value }] },
        async execute(args, exec) { await controller.message(callerId(exec.agent), args.taskId, args.text, args.action); return 'Delivered or already acknowledged'; } }));
    ctx.tools.register(defineTool({ name: 'darkingdoom_resume_task', description: 'Coordinator queues an idle blocked or parked task after a changed prerequisite or concrete solution backed by original diagnostic reports. Queue while capacity is full; owned recovery precedes new intake. Generic retries and duplicate background work are prohibited.',
        parameters: { taskId: { type: 'string', required: true }, evidence: { type: 'string', required: true } }, output: { schema: { type: 'string' }, render: (_a, value) => [{ type: 'text', text: value }] },
        async execute(args, exec) { return JSON.stringify(await controller.resumeTask(callerId(exec.agent), args.taskId, args.evidence)); } }));
    ctx.tools.register(defineTool({ name: 'darkingdoom_followup', description: 'Assigned worker creates an independent linked follow-up ticket with scope and acceptance criteria. Never defer a current blocking finding or acceptance failure.',
        parameters: { title: { type: 'string', required: true }, body: { type: 'string', required: true }, milestone: { type: 'string', required: true }, predecessors: { type: 'array', required: true, items: { type: 'string' } } },
        output: { schema: { type: 'string' }, render: (_a, value) => [{ type: 'text', text: value }] },
        async execute(args, exec) { return await controller.followup(callerId(exec.agent), args); } }));
    const repositoryContext = async (sessionId, provider) => {
        if (provider !== undefined && provider !== 'github' && provider !== 'azure')
            throw new Error('Unknown ticket source');
        const inspection = await ctx.sessionController.inspect(sessionId);
        if (!inspection.meta.cwd)
            throw new Error('The current session must belong to a repository');
        if (inspection.meta.parentSession)
            throw new Error('Activate DarKingDoom from the main repository session');
        return discoverRepository(inspection.meta.cwd, provider);
    };
    const start = async (sessionId, raw) => {
        const provider = raw && typeof raw === 'object' && 'provider' in raw ? raw.provider : undefined;
        const context = await repositoryContext(sessionId, provider);
        const parsed = validateConfig(bindRepositoryConfig(context, raw));
        await configureFullAccess(ctx, sessionId);
        const run = await controller.start(sessionId, parsed);
        await controller.announce(run, `${CAPTAIN_PROMPT}\nRun ${run.id} started. Configuration: ${JSON.stringify(run.config)}. No further approval is needed.`);
        return { run };
    };
    ctx.inject(['commands'], commands => commands.commands.register({ name: 'darkingdoom', description: 'Explicitly start autonomous delivery and its native coordinator loop in this repository, or control the current run.', input: { hint: 'start [JSON preferences] | loop | pause | resume | finish-existing | allow-new-tickets | drain | stop | status' },
        async handler(invocation) {
            try {
                const input = invocation.rawInput.trim(), space = input.indexOf(' ');
                const action = space < 0 ? input : input.slice(0, space);
                const id = invocation.agent.id;
                if (action === 'start')
                    await start(id, space < 0 ? undefined : JSON.parse(input.slice(space + 1)));
                else if (action === 'status')
                    return { kind: 'success', text: JSON.stringify((await controller.sessionView(id)).run) };
                else
                    await controller.control(id, action);
                return { kind: 'success', text: `DarKingDoom Plugin: ${action}` };
            }
            catch (error) {
                return { kind: 'error', text: String(error) };
            }
        } }));
    const reply = (res, status, data) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(data)); };
    ctx.inject(['webServer', 'connection'], web => {
        const server = authenticatedWebRoutes(web.get('webServer'), () => web.get('connection'));
        const route = (path, method, handler) => web.effect(() => server.register({ kind: 'exact', path,
            async handler(req, res) {
                if (req.method !== method) {
                    reply(res, 405, { error: `Use ${method}` });
                    return;
                }
                try {
                    await handler(req, res);
                }
                catch (error) {
                    reply(res, error instanceof RequestBodyError ? error.status : 400, { error: String(error) });
                }
            } }));
        route('/api/darkingdoom/state', 'GET', async (req, res) => {
            const id = new URL(req.url ?? '/', 'http://localhost').searchParams.get('sessionId');
            if (!id)
                throw new Error('sessionId is required');
            const view = await controller.sessionView(id), run = view.run;
            reply(res, 200, { ...view, coordinatorLoop: run ? controller.loopState(run.captainSessionId) : null, eligibility: run ? eligibility(run.tickets, run.config.milestones, run.tasks, run.config) : [], metrics: run?.tasks.map(t => ({ taskId: t.id, phases: phaseDurations(t) })) ?? [] });
        });
        route('/api/darkingdoom/evidence', 'GET', async (req, res) => {
            const id = new URL(req.url ?? '/', 'http://localhost').searchParams.get('sessionId');
            const run = id ? (await controller.sessionView(id)).run : null;
            if (!run)
                throw new Error('An existing delivery run is required');
            reply(res, 200, await runtime.evidence?.(run));
        });
        route('/api/darkingdoom/context', 'GET', async (req, res) => {
            const params = new URL(req.url ?? '/', 'http://localhost').searchParams;
            const id = params.get('sessionId');
            if (!id)
                throw new Error('sessionId is required');
            reply(res, 200, await repositoryContext(id, params.get('provider') ?? undefined));
        });
        route('/api/darkingdoom/start', 'POST', async (req, res) => {
            const body = await readJsonRequest(req);
            if (typeof body.sessionId !== 'string')
                throw new Error('sessionId required');
            reply(res, 200, await start(body.sessionId, body.config));
        });
        route('/api/darkingdoom/control', 'POST', async (req, res) => {
            const body = await readJsonRequest(req);
            if (typeof body.sessionId !== 'string' || typeof body.action !== 'string' || body.parallelism !== undefined && typeof body.parallelism !== 'number')
                throw new Error('Invalid control payload');
            reply(res, 200, { run: await controller.control(body.sessionId, body.action, body.parallelism) });
        });
        route('/api/darkingdoom/configure', 'POST', async (req, res) => {
            const body = await readJsonRequest(req);
            if (typeof body.sessionId !== 'string')
                throw new Error('Coordinator sessionId required');
            const saved = controller.state(body.sessionId);
            if (!saved || saved.captainSessionId !== body.sessionId || saved.status !== 'stopped')
                throw new Error('Only a stopped coordinator can save configuration');
            const revision = saved.coordinatorRevision;
            const updated = validateConfig(body.config);
            const context = await repositoryContext(body.sessionId, saved.config.provider);
            if (saved.coordinatorRevision !== revision || saved.status !== 'stopped')
                throw new Error('Run changed while checking repository configuration');
            reply(res, 200, { run: await controller.configure(body.sessionId, bindRepositoryConfig(context, updated)) });
        });
        route('/api/darkingdoom/milestones', 'POST', async (req, res) => {
            const body = await readJsonRequest(req);
            if (typeof body.sessionId !== 'string' || !Array.isArray(body.milestones))
                throw new Error('Coordinator identity and ordered milestone names required');
            const saved = controller.state(body.sessionId);
            if (!saved || saved.captainSessionId !== body.sessionId || !['running', 'paused'].includes(saved.status))
                throw new Error('Only the active coordinator can update milestone scope');
            const revision = saved.coordinatorRevision;
            const context = await repositoryContext(body.sessionId, saved.config.provider);
            const config = bindRepositoryConfig(context, validateConfig({ ...saved.config, milestones: body.milestones }));
            if (saved.coordinatorRevision !== revision || !['running', 'paused'].includes(saved.status))
                throw new Error('Run changed during milestone validation');
            if (context.config.repository !== saved.config.repository || context.config.workspace !== saved.config.workspace)
                throw new Error('Current session repository changed during milestone validation');
            reply(res, 200, { run: await controller.updateMilestones(body.sessionId, config.milestones, revision) });
        });
        route('/api/darkingdoom/policy', 'POST', async (req, res) => {
            const body = await readJsonRequest(req);
            if (typeof body.sessionId !== 'string')
                throw new Error('Coordinator identity required');
            const { sessionId, ...policy } = body;
            reply(res, 200, { run: await controller.updatePolicy(sessionId, policy) });
        });
        route('/api/darkingdoom/notice', 'POST', async (req, res) => {
            const body = await readJsonRequest(req);
            if (typeof body.sessionId !== 'string' || typeof body.text !== 'string' || !body.text.trim() || body.text.length > 20000)
                throw new Error('Coordinator notice needs session identity and concise operator evidence');
            const run = controller.state(body.sessionId);
            if (!run || run.captainSessionId !== body.sessionId || run.status !== 'running')
                throw new Error('Notice requires the active coordinator session');
            const accepted = await controller.announce(run, body.text);
            reply(res, accepted ? 200 : 503, { accepted, ...accepted ? {} : { error: 'Coordinator notice was not admitted; inspect the run delivery error and retry the same evidence when transport is restored' } });
        });
        route('/api/darkingdoom/resume-task', 'POST', async (req, res) => {
            const body = await readJsonRequest(req);
            if (typeof body.sessionId !== 'string' || typeof body.taskId !== 'string' || typeof body.evidence !== 'string' || body.maxTeamMembers !== undefined && typeof body.maxTeamMembers !== 'number')
                throw new Error('Task resumption needs coordinator identity, task identity and changed prerequisite evidence');
            reply(res, 200, { task: await controller.resumeTask(body.sessionId, body.taskId, body.evidence, true, body.maxTeamMembers) });
        });
    });
}
