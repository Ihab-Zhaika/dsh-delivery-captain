/** Read-only discovery in the current session repository. Never executes project scripts. */
import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { join, relative, resolve, isAbsolute } from 'node:path';
import { runCommand } from "./commands.js";
function identity(remote, address) {
    const github = address.match(/^(?:https?:\/\/(?:[^/@]+@)?github\.com\/|(?:ssh:\/\/)?git@github\.com[:/])([^/]+)\/([^/]+?)\/?(?:\.git)?$/i);
    if (github)
        return { provider: 'github', remote, repository: `${github[1]}/${github[2].replace(/\.git$/, '')}` };
    let azure = address.match(/^https?:\/\/(?:[^/@]+@)?dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/([^/]+)\/?$/i);
    if (!azure)
        azure = address.match(/^(?:ssh:\/\/)?git@ssh\.dev\.azure\.com[:/]v3\/([^/]+)\/([^/]+)\/([^/]+)$/i);
    if (!azure)
        azure = address.match(/^https?:\/\/(?:[^/@]+@)?([^/.]+)\.visualstudio\.com\/(?:DefaultCollection\/)?([^/]+)\/_git\/([^/]+)\/?$/i);
    if (azure)
        return { provider: 'azure', remote, organization: `https://dev.azure.com/${azure[1]}`, project: decodeURIComponent(azure[2]), repository: decodeURIComponent(azure[3]).replace(/\.git$/, '') };
}
async function text(root, name) {
    try {
        const path = await realpath(join(root, name)), rel = relative(root, path);
        if (rel.startsWith('..') || isAbsolute(rel) || (await stat(path)).size > 2_000_000)
            return undefined;
        return await readFile(path, 'utf8');
    }
    catch {
        return undefined;
    }
}
function ordered(names) {
    return [...new Set(names)].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}
function iterations(node) {
    const own = node.path?.replace(/^\\/, '').replace(/\\Iteration(?=\\|$)/, '');
    return [...(own ? [own] : []), ...(node.children ?? []).flatMap(child => iterations(child))];
}
export async function discoverRepository(cwd, provider, runner = runCommand) {
    const workspace = await realpath((await runner('git', ['rev-parse', '--show-toplevel'], { cwd })).trim());
    const git = (args) => runner('git', args, { cwd: workspace, timeoutMs: 20_000 });
    const warnings = [];
    const candidates = [];
    for (const remote of (await git(['remote'])).trim().split(/\r?\n/).filter(Boolean)) {
        const found = identity(remote, (await git(['remote', 'get-url', remote])).trim());
        if (found)
            candidates.push(found);
    }
    const retiredAzure = /retired|github is (?:now )?the only tracker/i.test((await text(workspace, 'docs/delivery/azure-devops/README.md'))?.slice(0, 700) ?? '');
    const preferred = provider ?? (retiredAzure && candidates.some(x => x.provider === 'github') ? 'github' : (candidates.find(x => x.remote === 'origin') ?? candidates[0])?.provider);
    const selected = candidates.find(x => x.provider === preferred && x.remote === 'origin') ?? candidates.find(x => x.provider === preferred);
    if (!selected)
        throw new Error(`The current session repository has no ${provider === 'azure' ? 'Azure DevOps' : provider === 'github' ? 'GitHub' : 'supported GitHub or Azure DevOps'} remote`);
    if (selected.provider === 'azure' && retiredAzure)
        warnings.push('This repository marks Azure DevOps delivery as retired. GitHub is its current tracker.');
    let targetBranch = '';
    try {
        // Ask the remote: a local remote/HEAD may be stale after a default-branch change.
        targetBranch = (await git(['ls-remote', '--symref', selected.remote, 'HEAD'])).match(/^ref: refs\/heads\/(.+)\s+HEAD$/m)?.[1] ?? '';
    }
    catch { /* Offline repositories can still use an explicitly recorded remote HEAD. */ }
    if (!targetBranch) {
        try {
            const head = (await git(['symbolic-ref', `refs/remotes/${selected.remote}/HEAD`])).trim();
            targetBranch = head.replace(`refs/remotes/${selected.remote}/`, '');
        }
        catch { /* Surface the unresolved branch below. */ }
    }
    if (!targetBranch)
        warnings.push('Could not discover the remote default branch. Check remote access before starting.');
    let names = [], milestoneSource = '', milestoneCatalog = [];
    const providerPlan = selected.provider === 'github' ? 'github' : 'azure-devops';
    const otherPlan = selected.provider === 'github' ? 'azure-devops' : 'github';
    for (const file of ['.darkingdoom.json', `docs/delivery/${providerPlan}/plan.json`, `docs/delivery/${otherPlan}/plan.json`]) {
        const source = await text(workspace, file);
        if (!source)
            continue;
        try {
            const value = JSON.parse(source);
            names = (value.milestones ?? []).map(x => typeof x === 'string' ? x : x.name ?? '').filter(Boolean);
            if (names.length) {
                milestoneSource = file;
                break;
            }
        }
        catch {
            warnings.push(`Could not read milestone order from ${file}`);
        }
    }
    try {
        if (selected.provider === 'github') {
            const rows = JSON.parse(await runner('gh', ['api', `repos/${selected.repository}/milestones?state=all&per_page=100`, '--paginate', '--slurp'], { cwd: workspace, timeoutMs: 30_000 })).flat();
            const titles = rows.map(x => x.title).filter(x => typeof x === 'string');
            milestoneCatalog = titles;
            if (!names.length) {
                names = ordered(titles);
                milestoneSource = 'GitHub milestones (numeric name order)';
            }
            else if (names.some(name => !titles.includes(name)))
                warnings.push('Some repository milestones are missing from the GitHub catalog. Confirm their exact names before starting.');
        }
        else {
            const tree = JSON.parse(await runner('az', ['devops', 'invoke', '--organization', selected.organization, '--area', 'wit', '--resource', 'classificationNodes', '--route-parameters', `project=${selected.project}`, 'structureGroup=iterations', '--query-parameters', '$depth=10', '--api-version', '7.1', '--output', 'json'], { cwd: workspace, timeoutMs: 30_000 }));
            const paths = iterations(tree);
            milestoneCatalog = paths;
            if (names.length) {
                const resolved = names.map(name => {
                    const matches = paths.filter(path => path === name || path.endsWith(`\\${name}`));
                    if (matches.length !== 1) {
                        warnings.push(`Cannot uniquely resolve Azure iteration: ${name}`);
                        return '';
                    }
                    return matches[0];
                });
                names = resolved.every(Boolean) ? resolved : [];
            }
            else {
                names = ordered(paths.filter(path => /\\M\d+\b/.test(path)));
                milestoneSource = 'Azure milestone iterations (numeric name order)';
            }
        }
    }
    catch {
        warnings.push(`Could not load ${selected.provider === 'github' ? 'GitHub milestones' : 'Azure milestone iterations'}; check CLI authentication.`);
        // Names are not valid Azure iteration paths without catalog resolution.
        if (selected.provider === 'azure')
            names = [];
    }
    if (!names.length)
        warnings.push('No delivery milestones were discovered. Set their exact delivery order before starting.');
    let verifyCommands = [], verificationSource = '';
    const settings = await text(workspace, '.darkingdoom.json');
    if (settings)
        try {
            const commands = JSON.parse(settings).verifyCommands;
            if (Array.isArray(commands) && commands.every(x => typeof x === 'string' && x.trim())) {
                verifyCommands = commands;
                verificationSource = '.darkingdoom.json';
            }
        }
        catch {
            warnings.push('Could not read repository verification settings');
        }
    if (!verifyCommands.length && await text(workspace, 'scripts/ci-local.ps1')) {
        verifyCommands = ['pwsh -NoProfile -File scripts/ci-local.ps1'];
        verificationSource = 'scripts/ci-local.ps1 (complete local CI)';
    }
    if (!verifyCommands.length) {
        const solution = (await readdir(workspace)).find(x => /\.slnx?$/.test(x));
        if (solution) {
            verifyCommands.push(`dotnet test "${solution}"`);
            verificationSource = solution;
        }
        for (const folder of ['', 'src/Web']) {
            const source = await text(workspace, join(folder, 'package.json'));
            if (!source)
                continue;
            try {
                const pkg = JSON.parse(source);
                const manager = pkg.packageManager?.split('@')[0] ?? (await text(workspace, join(folder, 'pnpm-lock.yaml')) ? 'pnpm' : 'npm');
                const cli = manager === 'pnpm' ? 'pnpm' : manager === 'yarn' ? 'yarn' : 'npm';
                const prefix = folder ? (cli === 'npm' ? `npm --prefix ${folder}` : cli === 'pnpm' ? `pnpm --dir ${folder}` : `yarn --cwd ${folder}`) : cli;
                for (const script of ['lint', 'typecheck', 'test', 'build'])
                    if (pkg.scripts?.[script])
                        verifyCommands.push(`${prefix} run ${script}`);
                verificationSource = [verificationSource, join(folder, 'package.json')].filter(Boolean).join(', ');
            }
            catch {
                warnings.push(`Could not read ${join(folder, 'package.json')}`);
            }
        }
    }
    if (!verifyCommands.length)
        warnings.push('No verification commands were discovered. Configure the repository gate before starting.');
    return { config: { ...selected, workspace, targetBranch, milestones: names, verifyCommands, parallelism: 2, maxTickets: 0, maxTeamMembers: 4, pollSeconds: 30, maxRepairRounds: 3, maxTaskMinutes: 120, workerPreset: 'standard', requireMemory: false, requireBrowser: false }, providers: [...new Set(candidates.map(x => x.provider))], warnings, milestoneSource, verificationSource, milestoneCatalog };
}
/** UI preferences can change; repository identity always belongs to the current session. */
export function bindRepositoryConfig(context, raw) {
    if (raw !== undefined && (!raw || typeof raw !== 'object' || Array.isArray(raw)))
        throw new Error('Configuration must be an object');
    const override = (raw ?? {});
    for (const key of ['workspace', 'provider', 'repository', 'remote', 'targetBranch', 'organization', 'project']) {
        const value = override[key], expected = context.config[key];
        const normalize = (path) => process.platform === 'win32' ? resolve(path).toLowerCase() : resolve(path);
        const matches = key === 'workspace' && typeof value === 'string' ? normalize(value) === normalize(context.config.workspace) : value === expected;
        if (value !== undefined && !matches)
            throw new Error(`${key} must match the current session repository`);
    }
    const bound = { ...context.config, ...override, workspace: context.config.workspace };
    if (!Array.isArray(bound.milestones) || bound.milestones.some(name => !context.milestoneCatalog.includes(name)))
        throw new Error('Every milestone must match an exact name or iteration path in the selected provider catalog');
    return bound;
}
