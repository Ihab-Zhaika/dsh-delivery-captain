import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCommand } from './commands.js';
import { dependencyBlocker } from './scheduler.js';
function object(value) { if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Provider returned an invalid object'); return value; }
function array(value) { if (!Array.isArray(value))
    throw new Error('Provider returned an invalid list'); return value.map(object); }
function required(value, name) { if (typeof value !== 'string' || !value.trim())
    throw new Error(`Provider missing ${name}`); return value; }
function numberId(value) { const id = String(value); if (!/^[1-9]\d*$/.test(id))
    throw new Error('Invalid ticket/PR id'); return id; }
function unique(items) { return [...new Set(items)]; }
function textDependencies(body) {
    let fence;
    let intro = true, contentSeen = false;
    return unique(body.split(/\r?\n/).flatMap(raw => {
        const delimiter = /^\s{0,3}(`{3,}|~{3,})/.exec(raw)?.[1];
        if (fence) {
            if (delimiter && delimiter[0] === fence[0] && delimiter.length >= fence.length && raw.trim() === delimiter)
                fence = undefined;
            return [];
        }
        if (delimiter) {
            fence = delimiter;
            intro = false;
            return [];
        }
        if (!raw.trim()) {
            if (contentSeen)
                intro = false;
            return [];
        }
        if (/^\s{0,3}#{1,6}\s/.test(raw))
            return [];
        contentSeen = true;
        const line = raw.replace(/\*\*/g, '').replace(/^\s*[-*]\s+/, '').trim();
        const declaration = line.match(/^(?:depends on|blocked by|predecessors)\b(?:\s*\([^)]*\))?\s*:?\s*(.*)$/i);
        // Follow-up is a dependency only when declared as such, including an issue's
        // severity/milestone introduction. Historical/independent discussion is not.
        const followup = line.match(/^follow[- ]up\s+(?:to|from|on)\b\s*:?\s*(.*)$/i)
            ?? (intro && /^(?:Severity\s*:\s*P\d+\.\s*(?:M\d+\s+)?|M\d+\s+)/i.test(line)
                ? line.match(/^[^!?]*?\bfollow[- ]up\s+(?:to|from|on)\b\s*:?\s*(.*)$/i) : null);
        if (!declaration && /\b(?:historical|independent)\b|\b(?:no|not a)\s+(?:prerequisite|dependency|follow[- ]up)\b|\b(?:does not|do not|doesn't|don't)\s+(?:depend|require)\b/i.test(line))
            return [];
        // A trailing independent-ticket explanation is prose, while a semicolon
        // followed by another bare reference still belongs to the declared list.
        const referenceText = (declaration ?? followup)?.[1]?.split(/\.\s+|\s+(?:related|see also)\s*:|;\s*(?=#\d+\s+(?:is|was|remains)\s+(?:otherwise\s+)?independent\b)/i)[0];
        // Mirrored tickets contain AB#123 alongside their GitHub #456 reference.
        // Azure IDs are not local GitHub issue numbers.
        return referenceText ? [...referenceText.matchAll(/(?<![\w/.-])#(\d+)\b/g)].map(match => match[1]) : [];
    }));
}
function marker(task, input) { return `darkingdoom-followup:${createHash('sha256').update(JSON.stringify([task.ticket.id, input.title, input.milestone, [...input.predecessors].sort()])).digest('hex').slice(0, 24)}`; }
function assertClaims(comments, runId) {
    for (const body of comments)
        for (const match of body.matchAll(/darkingdoom-claim:([^\s<>]+)/g)) {
            if (match[1] !== runId)
                throw new Error('Ticket has a claim from another DarKingDoom Plugin; reconcile ownership before retrying');
        }
}
class Provider {
    config;
    runner;
    constructor(config, runner) {
        this.config = config;
        this.runner = runner;
    }
    async json(file, args) { return JSON.parse(await this.runner(file, args, { cwd: this.config.workspace })); }
    async remotes() {
        const result = [];
        for (const flags of [[], ['--push']])
            result.push(...(await this.runner('git', ['remote', 'get-url', ...flags, '--all', '--', this.config.remote], { cwd: this.config.workspace })).trim().split(/\r?\n/));
        return result;
    }
    async push(task) {
        if (!task.headSha)
            throw new Error('Cannot push without a reviewed head');
        const local = (await this.runner('git', ['rev-parse', 'HEAD'], { cwd: task.worktree })).trim();
        if (local !== task.headSha)
            throw new Error('Local head changed before push');
        await this.runner('git', ['check-ref-format', '--branch', task.branch], { cwd: task.worktree });
        await this.runner('git', ['push', '--', this.config.remote, `${task.headSha}:refs/heads/${task.branch}`], { cwd: task.worktree });
    }
    async verifyDependencies(task) {
        try {
            const tickets = await this.dependencyClosure(await this.dependencySeed(task.ticket.id), true);
            const child = tickets.find(ticket => ticket.id === task.ticket.id);
            if (!child)
                throw new Error('Provider missing child ticket or returned a different identity');
            if (child.exclusion?.includes('another repository') || child.exclusion?.includes('another project'))
                return child.exclusion;
            // Only fresh remote closure counts here; managed task history is not proof.
            return dependencyBlocker(child, tickets, []);
        }
        catch (error) {
            return `Dependency verification failed: ${error instanceof Error ? error.message : String(error)}`;
        }
    }
    async confirmMerge(task, expected) {
        const pr = await this.inspectPullRequest(task);
        if (!pr.merged || !pr.mergeSha || pr.headSha !== expected)
            throw new Error('Merge is not yet confirmed at the expected head; reconciliation required');
        return pr;
    }
    async mergeResult(task, expected) {
        const pr = await this.inspectPullRequest(task);
        if (pr.headSha !== expected || (pr.merged && !pr.mergeSha))
            throw new Error('Merge result does not match the reviewed head');
        // Completion can be queued by server policies; the controller reconciles it.
        return pr;
    }
}
class GithubProvider extends Provider {
    endpoint(path, repo = this.config.repository) { return `repos/${repo}${path ? `/${path}` : ''}`; }
    api(path, args = []) { return this.json('gh', ['api', path, ...args]); }
    async pages(path) { const pages = await this.api(path, ['--paginate', '--slurp']); if (!Array.isArray(pages))
        throw new Error('Invalid paginated GitHub response'); return pages.flatMap(array); }
    identity(item) {
        const number = numberId(item.number);
        const url = required(item.html_url, 'issue URL');
        const match = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/(issues|pull)\/(\d+)$/.exec(url);
        if (!match || match[3] !== number || (match[2] === 'pull') !== !!item.pull_request)
            throw new Error(`Unsupported GitHub issue URL or identity: ${url}`);
        return { id: match[1].toLowerCase() === this.config.repository.toLowerCase() ? number : `${match[1]}#${number}`, repo: match[1], number };
    }
    splitId(id) { const [repo, number] = id.includes('#') ? id.split('#') : [this.config.repository, id]; if (!/^[\w.-]+\/[\w.-]+$/.test(repo))
        throw new Error('Invalid repository'); return { repo: repo, number: numberId(number) }; }
    async preflight() {
        for (const remote of await this.remotes()) {
            const normalized = remote.replace(/^git@github\.com:/i, 'https://github.com/').replace(/^ssh:\/\/git@github\.com\//i, 'https://github.com/');
            let url;
            try {
                url = new URL(normalized);
            }
            catch {
                throw new Error('Git remote is not a supported GitHub repository URL');
            }
            if (url.hostname.toLowerCase() !== 'github.com' || url.pathname.replace(/^\//, '').replace(/\.git\/?$/, '').toLowerCase() !== this.config.repository.toLowerCase())
                throw new Error('Git remote does not match configured GitHub repository');
        }
        await this.runner('gh', ['auth', 'status'], { cwd: this.config.workspace });
        await this.api(this.endpoint(''));
    }
    async discover() {
        let selected;
        if (this.config.query?.trim()) {
            const response = await this.api(`search/issues?q=${encodeURIComponent(`repo:${this.config.repository} is:issue ${this.config.query}`)}&per_page=100`, ['--paginate', '--slurp']);
            if (!Array.isArray(response))
                throw new Error('Invalid GitHub search response');
            const pages = response.map(object);
            const items = pages.flatMap(x => array(x.items));
            if (pages.some(x => x.incomplete_results || Number(x.total_count) > items.length))
                throw new Error('GitHub query results are incomplete; narrow the query');
            selected = new Set(items.map(x => this.identity(x).id));
        }
        const pending = (await this.pages(this.endpoint('issues?state=all&per_page=100'))).filter(x => !x.pull_request && (this.config.milestones.includes(x.milestone?.title) || (this.config.includeUnmilestoned === true && x.milestone == null)));
        const tickets = await this.dependencyClosure(pending);
        return tickets.map(ticket => !ticket.exclusion && selected && !selected.has(ticket.id) ? { ...ticket, selectionExclusion: 'Does not match configured query' } : ticket);
    }
    async dependencySeed(id) {
        const ref = this.splitId(id);
        const item = object(await this.api(this.endpoint(`issues/${ref.number}`, ref.repo)));
        if (this.identity(item).id !== id || item.pull_request)
            throw new Error('GitHub child ticket identity mismatch');
        return [item];
    }
    async dependencyClosure(pending, fresh = false) {
        const tickets = new Map();
        for (let index = 0; index < pending.length; index++) {
            const item = pending[index];
            const { id, repo, number } = this.identity(item);
            if (tickets.has(id))
                continue;
            if (item.pull_request) {
                const pr = object(await this.api(this.endpoint(`pulls/${number}`, repo)));
                if (numberId(pr.number) !== number || pr.html_url !== item.html_url || pr.base?.repo?.full_name?.toLowerCase() !== repo.toLowerCase())
                    throw new Error('GitHub PR dependency identity mismatch');
                if (!['open', 'closed'].includes(pr.state) || typeof pr.merged !== 'boolean')
                    throw new Error('Invalid GitHub PR dependency state');
                const merged = pr.state === 'closed' && pr.merged === true && typeof pr.merge_commit_sha === 'string' && /^[a-f0-9]{40,64}$/i.test(pr.merge_commit_sha) && pr.base?.ref === this.config.targetBranch;
                tickets.set(id, { id, title: required(item.title, 'PR dependency title'), body: typeof item.body === 'string' ? item.body : '', url: item.html_url, milestone: item.milestone?.title ?? '', predecessors: [], state: pr.state, merged, priority: 99, createdAt: item.created_at ?? '', labels: [], exclusion: 'Pull request dependencies are not executable tickets' });
                continue;
            }
            // A failed native endpoint cannot prove that the textual fallback is complete.
            const native = await this.pages(this.endpoint(`issues/${number}/dependencies/blocked_by?per_page=100`, repo));
            const body = typeof item.body === 'string' ? item.body : '';
            const predecessors = unique([...native.map(x => this.identity(x).id), ...textDependencies(body).map(n => repo.toLowerCase() === this.config.repository.toLowerCase() ? n : `${repo}#${n}`)]);
            if (!['open', 'closed'].includes(item.state))
                throw new Error('Unknown GitHub issue state');
            let merged = false;
            if (item.state === 'closed') {
                const [owner, name] = repo.split('/');
                const query = 'query($owner:String!,$name:String!,$number:Int!,$endCursor:String){repository(owner:$owner,name:$name){issue(number:$number){closedByPullRequestsReferences(first:100,after:$endCursor,includeClosedPrs:true){nodes{merged mergeCommit{oid} baseRefName repository{nameWithOwner}} pageInfo{hasNextPage endCursor}}}}}';
                const response = await this.api('graphql', ['-f', `query=${query}`, '-f', `owner=${owner}`, '-f', `name=${name}`, '-F', `number=${number}`, '--paginate', '--slurp']);
                if (!Array.isArray(response))
                    throw new Error('Invalid GitHub closing-reference response');
                for (const page of response) {
                    if (object(page).errors)
                        throw new Error('GitHub closing-reference query failed');
                    const refs = object(page.data?.repository?.issue?.closedByPullRequestsReferences);
                    if (array(refs.nodes).some(pr => pr.merged === true && pr.mergeCommit?.oid && pr.baseRefName === this.config.targetBranch && pr.repository?.nameWithOwner?.toLowerCase() === repo.toLowerCase()))
                        merged = true;
                }
            }
            const labels = array(item.labels ?? []).map(x => required(x.name, 'label name'));
            const priorityLabel = labels.find(x => /^p[0-9]$/i.test(x));
            tickets.set(id, { id, title: required(item.title, 'issue title'), body, url: item.html_url, milestone: item.milestone?.title ?? '', predecessors, state: item.state, merged, completedDecision: item.state === 'closed' && item.state_reason === 'completed' && labels.includes('kind:decision'), priority: priorityLabel ? Number(priorityLabel.slice(1)) : 99, createdAt: item.created_at ?? '', labels, exclusion: repo.toLowerCase() !== this.config.repository.toLowerCase() ? 'Dependency belongs to another repository' : undefined });
            if (!fresh)
                pending.push(...native);
            for (const dependency of predecessors) {
                if (tickets.has(dependency) || pending.some(x => this.identity(x).id === dependency))
                    continue;
                const ref = this.splitId(dependency);
                const predecessor = object(await this.api(this.endpoint(`issues/${ref.number}`, ref.repo)));
                if (this.identity(predecessor).id !== dependency)
                    throw new Error('GitHub predecessor identity mismatch');
                pending.push(predecessor);
            }
        }
        return [...tickets.values()];
    }
    async claim(ticket, runId) {
        if (ticket.exclusion === 'Pull request dependencies are not executable tickets' || /\/pull\/\d+$/.test(ticket.url ?? ''))
            throw new Error('Pull request dependencies are not executable tickets');
        const ref = this.splitId(ticket.id);
        const comments = await this.pages(this.endpoint(`issues/${ref.number}/comments?per_page=100`, ref.repo));
        const tag = `<!-- darkingdoom-claim:${runId} -->`;
        assertClaims(comments.map(x => typeof x.body === 'string' ? x.body : ''), runId);
        if (!comments.some(x => typeof x.body === 'string' && x.body.includes(tag)))
            await this.api(this.endpoint(`issues/${ref.number}/comments`, ref.repo), ['--method', 'POST', '-f', `body=${tag}\nDarKingDoom Plugin is working on this ticket.`]);
    }
    async ensurePullRequest(task) {
        const prs = await this.pages(this.endpoint(`pulls?state=all&head=${encodeURIComponent(this.config.repository.split('/')[0] + ':' + task.branch)}&base=${encodeURIComponent(this.config.targetBranch)}&per_page=100`));
        const matches = prs.filter(x => x.head?.ref === task.branch && x.head?.repo?.full_name?.toLowerCase() === this.config.repository.toLowerCase() && x.base?.ref === this.config.targetBranch && (x.state === 'open' || x.merged_at));
        if (matches.length > 1)
            throw new Error('Multiple pull requests match worker branch');
        if (matches[0]?.merged_at) {
            task.prUrl = required(matches[0].html_url, 'PR URL');
            return this.inspectPullRequest(task);
        }
        await this.push(task);
        const pr = matches[0] ?? object(await this.api(this.endpoint('pulls'), ['--method', 'POST', '-f', `title=${task.ticket.title}`, '-f', `head=${task.branch}`, '-f', `base=${this.config.targetBranch}`, '-f', `body=Closes #${numberId(task.ticket.id)}\n\nDarKingDoom Plugin task ${task.id}`]));
        const closingLine = `Closes #${numberId(task.ticket.id)}`;
        if (matches[0] && !String(pr.body ?? '').split(/\r?\n/).includes(closingLine))
            await this.api(this.endpoint(`pulls/${numberId(pr.number)}`), ['--method', 'PATCH', '-f', `body=${pr.body ?? ''}\n\n${closingLine}`]);
        task.prUrl = required(pr.html_url, 'PR URL');
        return this.inspectPullRequest(task);
    }
    async inspectPullRequest(task) {
        const pr = object(await this.json('gh', ['pr', 'view', task.prUrl || task.branch, '--repo', this.config.repository, '--json', 'number,url,headRefOid,headRefName,baseRefName,isCrossRepository,state,isDraft,mergeStateStatus,reviewDecision,statusCheckRollup,mergeCommit']));
        const headSha = required(pr.headRefOid, 'PR head');
        const checks = array(pr.statusCheckRollup ?? []);
        let goodChecks = checks.every(x => x.__typename === 'StatusContext' ? x.state === 'SUCCESS' : x.status === 'COMPLETED' && ['SUCCESS', 'NEUTRAL', 'SKIPPED'].includes(x.conclusion));
        if (pr.state === 'OPEN' && (!task.headSha || task.headSha === headSha)) {
            // The GraphQL rollup can truncate; inspect every check attached to this SHA.
            const pages = await this.api(this.endpoint(`commits/${encodeURIComponent(headSha)}/check-runs?per_page=100&filter=latest`), ['--paginate', '--slurp']);
            if (!Array.isArray(pages))
                throw new Error('Invalid check run pages');
            const runs = pages.flatMap(x => array(object(x).check_runs));
            const statuses = await this.pages(this.endpoint(`commits/${encodeURIComponent(headSha)}/statuses?per_page=100`));
            const latest = new Map();
            for (const status of statuses) {
                const context = required(status.context, 'status context');
                if (!latest.has(context))
                    latest.set(context, status);
            }
            goodChecks = goodChecks && runs.every(x => x.status === 'completed' && ['success', 'neutral', 'skipped'].includes(x.conclusion)) && [...latest.values()].every(x => x.state === 'success');
        }
        const identity = pr.headRefName === task.branch && pr.baseRefName === this.config.targetBranch && pr.isCrossRepository === false && String(pr.url).toLowerCase() === `https://github.com/${this.config.repository}/pull/${pr.number}`.toLowerCase();
        const checksPassed = identity && pr.state === 'OPEN' && pr.isDraft === false && pr.mergeStateStatus === 'CLEAN' && ['', 'APPROVED', null, undefined].includes(pr.reviewDecision) && goodChecks;
        return { id: numberId(pr.number), url: required(pr.url, 'PR URL'), headSha, merged: identity && pr.state === 'MERGED', mergeSha: pr.mergeCommit?.oid, checksPassed, blockedReason: checksPassed ? undefined : 'Remote checks, reviews, branch identity or merge policies are not satisfied' };
    }
    async merge(task, expectedHead) {
        const pr = await this.inspectPullRequest(task);
        if (pr.headSha !== expectedHead)
            throw new Error('Pull request head changed since review');
        if (pr.merged)
            return this.confirmMerge(task, expectedHead);
        if (!pr.checksPassed)
            throw new Error(pr.blockedReason);
        await this.runner('gh', ['pr', 'merge', pr.id, '--repo', this.config.repository, '--merge', '--match-head-commit', expectedHead], { cwd: this.config.workspace });
        return this.mergeResult(task, expectedHead);
    }
    async close(task) {
        await this.confirmMerge(task, required(task.headSha, 'reviewed head'));
        await this.api(this.endpoint(`issues/${numberId(task.ticket.id)}`), ['--method', 'PATCH', '-f', 'state=closed', '-f', 'state_reason=completed']);
    }
    async createFollowup(task, input) {
        if (!input.milestone && this.config.includeUnmilestoned !== true)
            throw new Error('Unmilestoned follow-ups are not enabled');
        const tag = marker(task, input);
        const existing = (await this.pages(this.endpoint('issues?state=all&per_page=100'))).filter(x => !x.pull_request && x.body?.includes(`<!-- ${tag} -->`));
        if (existing.length > 1)
            throw new Error('Duplicate follow-up markers found');
        const milestoneArgs = [];
        if (input.milestone) {
            const milestones = await this.pages(this.endpoint('milestones?state=all&per_page=100'));
            const milestone = milestones.find(x => x.title === input.milestone);
            if (!milestone)
                throw new Error('Follow-up milestone does not exist');
            milestoneArgs.push('-F', `milestone=${numberId(milestone.number)}`);
        }
        const dependencies = unique([task.ticket.id, ...input.predecessors]);
        const issue = existing[0] ?? object(await this.api(this.endpoint('issues'), ['--method', 'POST', '-f', `title=${input.title}`, '-f', `body=${input.body}\n\nDepends on ${dependencies.map(x => '#' + x).join(', ')}\n<!-- ${tag} -->`, ...milestoneArgs]));
        const id = numberId(issue.number);
        const linked = await this.pages(this.endpoint(`issues/${id}/dependencies/blocked_by?per_page=100`));
        for (const dep of dependencies) {
            if (linked.some(x => this.identity(x).id === dep))
                continue;
            const ref = this.splitId(dep);
            const predecessor = object(await this.api(this.endpoint(`issues/${ref.number}`, ref.repo)));
            await this.api(this.endpoint(`issues/${id}/dependencies/blocked_by`), ['--method', 'POST', '-F', `issue_id=${numberId(predecessor.id)}`]);
        }
        return id;
    }
}
class AzureProvider extends Provider {
    flags() { return ['--org', required(this.config.organization, 'Azure organization'), '--project', required(this.config.project, 'Azure project'), '--output', 'json']; }
    az(args, project = true) { return this.json('az', [...args, ...(project ? this.flags() : ['--org', required(this.config.organization, 'Azure organization'), '--output', 'json'])]); }
    async invoke(area, resource, route, method = 'GET', body, query = []) {
        // Azure CLI parses this as float(version.replace('-preview', '')) and rejects
        // dotted preview revisions such as 7.1-preview.4; use negotiated preview.
        const args = ['devops', 'invoke', '--area', area, '--resource', resource, '--route-parameters', `project=${this.config.project}`, ...route, '--http-method', method, '--api-version', resource === 'comments' ? '7.1-preview' : '7.1', ...(query.length ? ['--query-parameters', ...query] : [])];
        if (body === undefined)
            return this.az(args, false);
        const folder = await mkdtemp(join(tmpdir(), 'captain-api-'));
        try {
            const file = join(folder, 'body.json');
            await writeFile(file, JSON.stringify(body), 'utf8');
            return await this.az([...args, '--in-file', file], false);
        }
        finally {
            await rm(folder, { recursive: true, force: true });
        }
    }
    async preflight() {
        // Works for either PAT (AZURE_DEVOPS_EXT_PAT) or Azure login authentication.
        await this.az(['devops', 'project', 'show', '--project', this.config.project], false);
        const repository = object(await this.az(['repos', 'show', '--repository', this.config.repository]));
        const org = new URL(this.config.organization);
        const expectedOrg = org.hostname === 'dev.azure.com' ? org.pathname.replace(/^\/|\/$/g, '') : org.hostname.replace(/\.visualstudio\.com$/, '');
        const expectedProject = this.config.project.toLowerCase();
        for (const remote of await this.remotes()) {
            const normalized = remote.replace(/^git@ssh\.dev\.azure\.com:v3\//i, 'https://ssh.dev.azure.com/v3/').replace(/^ssh:\/\/git@ssh\.dev\.azure\.com\//i, 'https://ssh.dev.azure.com/');
            let url;
            try {
                url = new URL(normalized);
            }
            catch {
                throw new Error('Git remote is not a supported Azure repository URL');
            }
            const pieces = decodeURIComponent(url.pathname).replace(/\.git$/, '').split('/').filter(Boolean);
            let remoteOrg, project, repo;
            if (url.hostname === 'ssh.dev.azure.com' && pieces[0] === 'v3')
                [, remoteOrg, project, repo] = pieces;
            else if (url.hostname === 'dev.azure.com' && pieces[2] === '_git')
                [remoteOrg, project, , repo] = pieces;
            else if (url.hostname.endsWith('.visualstudio.com') && pieces[1] === '_git') {
                remoteOrg = url.hostname.replace(/\.visualstudio\.com$/, '');
                [project, , repo] = pieces;
            }
            if (remoteOrg?.toLowerCase() !== expectedOrg.toLowerCase() || project?.toLowerCase() !== expectedProject || ![repository.id, repository.name, this.config.repository].some(x => typeof x === 'string' && x.toLowerCase() === repo?.toLowerCase()))
                throw new Error('Git remote does not match configured Azure organization/project/repository');
        }
    }
    async query(wiql) {
        let results = array((await this.az(['boards', 'query', '--wiql', wiql])) ?? []);
        // Azure CLI deliberately truncates flat queries at 1000. REST returns the
        // complete reference set or an explicit WIQL size-limit error (fail closed).
        if (results.length >= 1000)
            results = array(object(await this.invoke('wit', 'wiql', [], 'POST', { query: wiql })).workItems);
        return results;
    }
    async discover() {
        const quote = (s) => s.replace(/'/g, "''");
        const iterations = unique([...this.config.milestones, ...(this.config.includeUnmilestoned === true ? [this.config.project] : [])]);
        if (!iterations.length)
            return [];
        const wiql = `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${quote(this.config.project)}' AND [System.IterationPath] IN (${iterations.map(x => `'${quote(x)}'`).join(',')}) ORDER BY [System.Id]`;
        const results = await this.query(wiql);
        const selected = this.config.query?.trim() ? new Set((await this.query(this.config.query)).map(x => numberId(x.id))) : undefined;
        const tickets = await this.dependencyClosure(results.map(x => numberId(x.id)));
        return tickets.map(ticket => !ticket.exclusion && selected && !selected.has(ticket.id) ? { ...ticket, selectionExclusion: 'Does not match configured query' } : ticket);
    }
    async dependencySeed(id) { return [numberId(id)]; }
    async dependencyClosure(pending) {
        const tickets = new Map();
        const workflowStates = new Map();
        for (let index = 0; index < pending.length; index++) {
            const id = pending[index];
            if (tickets.has(id))
                continue;
            const item = object(await this.az(['boards', 'work-item', 'show', '--id', id, '--expand', 'relations'], false));
            if (numberId(item.id) !== id)
                throw new Error('Azure work item identity mismatch');
            const fields = object(item.fields);
            const project = required(fields['System.TeamProject'], 'work item project');
            const type = required(fields['System.WorkItemType'], 'work item type');
            const state = required(fields['System.State'], 'work item state');
            const workflowKey = JSON.stringify([project.toLowerCase(), type.toLowerCase()]);
            let states = workflowStates.get(workflowKey);
            if (!states) {
                states = array(object(await this.invoke('wit', 'workItemTypeStates', [`project=${project}`, `type=${type}`])).value);
                workflowStates.set(workflowKey, states);
            }
            const category = required(states.find(x => x.name === state)?.category, 'work item workflow state category');
            const completed = category === 'Completed';
            const relations = array(item.relations ?? []);
            const predecessors = unique(relations.filter(x => x.rel === 'System.LinkTypes.Dependency-Reverse').map(x => {
                const match = /\/_apis\/wit\/workItems\/(\d+)$/i.exec(required(x.url, 'dependency URL'));
                if (!match)
                    throw new Error('Unrecognized Azure predecessor relation');
                const org = new URL(this.config.organization);
                const link = new URL(x.url);
                if (link.host !== org.host || !link.pathname.toLowerCase().startsWith(org.pathname.replace(/\/$/, '').toLowerCase() + '/'))
                    throw new Error('Cross-organization dependencies are unsupported');
                return numberId(match[1]);
            }));
            let merged = false;
            for (const relation of relations.filter(x => x.rel === 'ArtifactLink' && x.attributes?.name === 'Pull Request')) {
                const link = decodeURIComponent(required(relation.url, 'PR artifact'));
                const match = /^vstfs:\/\/\/Git\/PullRequestId\/([^/]+)\/([^/]+)\/(\d+)$/.exec(link);
                if (!match)
                    throw new Error('Unrecognized Azure pull request artifact');
                const pr = object(await this.az(['repos', 'pr', 'show', '--id', match[3]], false));
                if (pr.repository?.id === match[2] && pr.repository?.project?.id === match[1] && pr.status === 'completed' && pr.lastMergeCommit?.commitId && pr.targetRefName === `refs/heads/${this.config.targetBranch}`)
                    merged = true;
            }
            const body = [
                ['Description', fields['System.Description']],
                ['Acceptance criteria', fields['Microsoft.VSTS.Common.AcceptanceCriteria']],
                ['Reproduction steps', fields['System.ReproSteps']],
                ['Reproduction steps', fields['Microsoft.VSTS.TCM.ReproSteps']],
            ].filter(([, value]) => typeof value === 'string' && value.trim()).map(([label, value]) => `${label}:\n${value}`).join('\n\n');
            const rawIterationPath = fields['System.IterationPath'] ?? '';
            const milestone = project.toLowerCase() === this.config.project.toLowerCase() && rawIterationPath === project && !this.config.milestones.includes(rawIterationPath) ? '' : rawIterationPath;
            const exclusion = project.toLowerCase() !== this.config.project.toLowerCase() ? 'Dependency belongs to another project'
                : category === 'Removed' ? 'Work item workflow category is Removed' : undefined;
            const labels = typeof fields['System.Tags'] === 'string' ? fields['System.Tags'].split(';').map((x) => x.trim()) : [];
            tickets.set(id, { id, title: required(fields['System.Title'], 'work item title'), body, url: item._links?.html?.href ?? `${this.config.organization}/${encodeURIComponent(project)}/_workitems/edit/${id}`, milestone, predecessors, state: completed ? 'closed' : 'open', merged: completed && merged, completedDecision: completed && labels.includes('kind:decision'), priority: Number(fields['Microsoft.VSTS.Common.Priority']) || 99, createdAt: fields['System.CreatedDate'] ?? '', labels, exclusion });
            pending.push(...predecessors);
        }
        return [...tickets.values()];
    }
    async claim(ticket, runId) {
        const comments = [];
        let continuation;
        do {
            const page = object(await this.invoke('wit', 'comments', [`workItemId=${numberId(ticket.id)}`], 'GET', undefined, continuation ? [`continuationToken=${continuation}`] : []));
            comments.push(...array(page.comments).map(x => typeof x.text === 'string' ? x.text : ''));
            continuation = page.continuationToken || page.continuation_token ? String(page.continuationToken || page.continuation_token) : undefined;
        } while (continuation);
        assertClaims(comments, runId);
        const tag = `darkingdoom-claim:${runId}`;
        // Local repository ownership and persisted claims provide the authoritative lock.
        if (!comments.some(x => x.includes(tag)))
            await this.az(['boards', 'work-item', 'update', '--id', numberId(ticket.id), '--discussion', tag], false);
    }
    async pr(task) {
        if (task.prUrl) {
            const match = /\/pullrequest\/(\d+)(?:\?.*)?$/i.exec(task.prUrl);
            if (!match)
                throw new Error('Invalid Azure PR URL');
            return object(await this.az(['repos', 'pr', 'show', '--id', match[1]], false));
        }
        const prs = await this.listPrs(task.branch);
        if (prs.length !== 1)
            throw new Error('Expected exactly one matching Azure PR');
        return prs[0];
    }
    async listPrs(branch) {
        const rows = [];
        for (let skip = 0;; skip += 100) {
            const page = array(await this.az(['repos', 'pr', 'list', '--repository', this.config.repository, '--source-branch', branch, '--target-branch', this.config.targetBranch, '--status', 'all', '--skip', String(skip), '--top', '100']));
            rows.push(...page.filter(x => ['active', 'completed'].includes(x.status)));
            if (page.length < 100)
                return rows;
        }
    }
    async ensurePullRequest(task) {
        const matches = await this.listPrs(task.branch);
        if (matches.length > 1)
            throw new Error('Multiple pull requests match worker branch');
        if (matches[0]?.status === 'completed') {
            task.prUrl = this.prUrl(matches[0]);
            return this.inspectPullRequest(task);
        }
        await this.push(task);
        const pr = matches[0] ?? object(await this.az(['repos', 'pr', 'create', '--repository', this.config.repository, '--source-branch', task.branch, '--target-branch', this.config.targetBranch, '--title', task.ticket.title, '--description', `DarKingDoom Plugin task ${task.id}`, '--work-items', numberId(task.ticket.id)]));
        if (matches[0]) {
            const linked = array(await this.az(['repos', 'pr', 'work-item', 'list', '--id', numberId(pr.pullRequestId)], false));
            if (!linked.some(x => String(x.id) === task.ticket.id))
                await this.az(['repos', 'pr', 'work-item', 'add', '--id', numberId(pr.pullRequestId), '--work-items', numberId(task.ticket.id)], false);
        }
        task.prUrl = this.prUrl(pr);
        return this.inspectPullRequest(task);
    }
    prUrl(pr) { return `${this.config.organization}/${encodeURIComponent(this.config.project)}/_git/${encodeURIComponent(this.config.repository)}/pullrequest/${numberId(pr.pullRequestId)}`; }
    async inspectPullRequest(task) {
        const pr = await this.pr(task);
        const headSha = required(pr.lastMergeSourceCommit?.commitId, 'PR head');
        const identity = pr.sourceRefName === `refs/heads/${task.branch}` && pr.targetRefName === `refs/heads/${this.config.targetBranch}` && [pr.repository?.id, pr.repository?.name].includes(this.config.repository);
        const policies = [];
        let statusesPassed = true;
        if (pr.status !== 'completed') {
            for (let skip = 0;; skip += 100) {
                const page = array(await this.az(['repos', 'pr', 'policy', 'list', '--id', numberId(pr.pullRequestId), '--skip', String(skip), '--top', '100'], false));
                policies.push(...page);
                if (page.length < 100)
                    break;
            }
            const route = [`repositoryId=${this.config.repository}`, `pullRequestId=${numberId(pr.pullRequestId)}`];
            const iterations = array(object(await this.invoke('git', 'pullRequestIterations', route)).value);
            const latestIteration = iterations.reduce((latest, item) => !latest || Number(item.id) > Number(latest.id) ? item : latest, undefined);
            if (!latestIteration || latestIteration.sourceRefCommit?.commitId !== headSha)
                statusesPassed = false;
            const statuses = array(object(await this.invoke('git', 'pullRequestStatuses', route)).value);
            const latest = new Map();
            for (const status of statuses) {
                if (status.iterationId && status.iterationId !== latestIteration?.id)
                    continue;
                const key = `${status.context?.genre ?? ''}:${required(status.context?.name, 'status context')}`;
                if (!latest.has(key) || Number(status.id) > Number(latest.get(key).id))
                    latest.set(key, status);
            }
            statusesPassed = statusesPassed && [...latest.values()].every(x => x.state === 'succeeded' || x.state === 'notApplicable');
        }
        const policiesPassed = policies.every(x => x.configuration?.isEnabled === false || x.configuration?.isBlocking === false || x.status === 'approved');
        const checksPassed = identity && pr.status === 'active' && pr.isDraft === false && pr.mergeStatus === 'succeeded' && policiesPassed && statusesPassed && array(pr.reviewers ?? []).every(x => Number(x.vote) >= 0 && (!x.isRequired || Number(x.vote) >= 5));
        return { id: numberId(pr.pullRequestId), url: this.prUrl(pr), headSha, merged: identity && pr.status === 'completed', mergeSha: pr.lastMergeCommit?.commitId, checksPassed, blockedReason: checksPassed ? undefined : 'Azure policies, reviewers, draft, branch identity or merge status block completion' };
    }
    async merge(task, expectedHead) {
        const pr = await this.inspectPullRequest(task);
        if (pr.headSha !== expectedHead)
            throw new Error('Pull request head changed since review');
        if (pr.merged)
            return this.confirmMerge(task, expectedHead);
        if (!pr.checksPassed)
            throw new Error(pr.blockedReason);
        await this.invoke('git', 'pullRequests', [`repositoryId=${this.config.repository}`, `pullRequestId=${pr.id}`], 'PATCH', { status: 'completed', lastMergeSourceCommit: { commitId: expectedHead }, completionOptions: { bypassPolicy: false, deleteSourceBranch: false, transitionWorkItems: false } });
        return this.mergeResult(task, expectedHead);
    }
    async close(task) {
        await this.confirmMerge(task, required(task.headSha, 'reviewed head'));
        const item = object(await this.az(['boards', 'work-item', 'show', '--id', numberId(task.ticket.id)], false));
        const type = required(item.fields?.['System.WorkItemType'], 'work item type');
        const response = object(await this.invoke('wit', 'workItemTypeStates', [`type=${type}`]));
        const completed = array(response.value).find(x => x.category === 'Completed');
        if (!completed)
            throw new Error('No completed state is configured for this work item type');
        await this.az(['boards', 'work-item', 'update', '--id', numberId(task.ticket.id), '--state', required(completed.name, 'completed state')], false);
    }
    async createFollowup(task, input) {
        if (!input.milestone && this.config.includeUnmilestoned !== true)
            throw new Error('Unmilestoned follow-ups are not enabled');
        const tag = marker(task, input);
        const quote = (s) => s.replace(/'/g, "''");
        const matches = array((await this.az(['boards', 'query', '--wiql', `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${quote(this.config.project)}' AND [System.Tags] CONTAINS '${tag}'`])) ?? []);
        if (matches.length > 1)
            throw new Error('Duplicate follow-up markers found');
        const item = matches[0] ?? object(await this.az(['boards', 'work-item', 'create', '--type', 'Task', '--title', input.title, '--description', input.body, '--iteration', input.milestone || this.config.project, '--fields', `System.Tags=${tag}`]));
        const id = numberId(item.id);
        const full = object(await this.az(['boards', 'work-item', 'show', '--id', id, '--expand', 'relations'], false));
        const existing = array(full.relations ?? []).filter(x => x.rel === 'System.LinkTypes.Dependency-Reverse').map(x => /\/(\d+)$/.exec(x.url)?.[1]);
        for (const predecessor of unique([task.ticket.id, ...input.predecessors])) {
            if (!existing.includes(predecessor))
                await this.az(['boards', 'work-item', 'relation', 'add', '--id', id, '--relation-type', 'System.LinkTypes.Dependency-Reverse', '--target-id', numberId(predecessor)], false);
        }
        return id;
    }
}
export function createProvider(config, runner = runCommand) {
    const controller = new AbortController();
    const cancellable = async (file, args, options) => {
        const signal = options?.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal;
        signal.throwIfAborted();
        const output = await runner(file, args, { ...options, signal });
        signal.throwIfAborted();
        return output;
    };
    const cancel = () => controller.abort(new Error('Provider cancelled'));
    if (config.provider === 'github') {
        if (!/^[\w.-]+\/[\w.-]+$/.test(config.repository))
            throw new Error('GitHub repository must be owner/name');
        return Object.assign(new GithubProvider(config, cancellable), { cancel });
    }
    if (config.provider === 'azure') {
        required(config.organization, 'Azure organization');
        required(config.project, 'Azure project');
        return Object.assign(new AzureProvider(config, cancellable), { cancel });
    }
    throw new Error('Unsupported delivery provider');
}
