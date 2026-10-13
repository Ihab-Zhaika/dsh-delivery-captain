/** The build and runtime use the same read-only source/output stamp verifier. */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const STAMP = 'lib/git-artifact-stamp.json';
const REQUIRED = ['lib/captain.js', 'lib/client.js', 'lib/types/captain.d.ts', 'lib/types/client/captain-index.d.ts'];
const CONFIG = ['tsconfig.json', 'tsconfig.client.json', 'tsdown.config.ts', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'scripts/clean-build.mjs', 'scripts/git-artifacts.mjs', 'scripts/normalize-build-inputs.mjs'];
function files(root, directory) { return readdirSync(join(root, directory), { withFileTypes: true }).flatMap(entry => { const path = `${directory}/${entry.name}`; if (entry.isDirectory())
    return files(root, path); if (!entry.isFile())
    throw new Error(`Unsupported build input/output: ${path}`); return [path]; }).sort(); }
function digest(root, paths, prefix = '') { const hash = createHash('sha256').update(prefix); for (const path of [...paths].sort())
    hash.update(path).update('\0').update(readFileSync(join(root, path))).update('\0'); return hash.digest('hex'); }
export function currentGitArtifacts(root) {
    for (const path of REQUIRED)
        if (!existsSync(join(root, path)))
            throw new Error(`Missing Git artifact: ${path}; run pnpm build`);
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    const settings = JSON.stringify({ name: pkg.name, version: pkg.version, type: pkg.type, exports: pkg.exports, devDependencies: pkg.devDependencies, dependencies: pkg.dependencies, build: pkg.scripts?.build });
    return { schema: 1, source: digest(root, [...files(root, 'src'), ...CONFIG], settings), output: digest(root, files(root, 'lib').filter(path => path !== STAMP)) };
}
export function verifyGitArtifacts(root) {
    const saved = JSON.parse(readFileSync(join(root, STAMP), 'utf8')), actual = currentGitArtifacts(root);
    if (saved.schema !== actual.schema || saved.source !== actual.source || saved.output !== actual.output)
        throw new Error('Git artifacts are stale or modified; run pnpm build and include lib/ with the source changes');
    return actual;
}
