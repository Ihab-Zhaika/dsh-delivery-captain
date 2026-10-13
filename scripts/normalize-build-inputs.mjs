/** Keep source stamps reproducible across Windows and POSIX checkouts. */
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
const root = new URL('../', import.meta.url)
async function normalize(path) {
  const file = new URL(path, root)
  const text = await readFile(file, 'utf8')
  if (text.includes('\r\n')) await writeFile(file, text.replaceAll('\r\n', '\n'))
}
async function walk(path) {
  for (const entry of await readdir(new URL(path, root), { withFileTypes: true })) {
    const next = join(path, entry.name).replaceAll('\\', '/')
    if (entry.isDirectory()) await walk(`${next}/`)
    else if (entry.isFile() && /\.(?:[cm]?[jt]sx?|css|json|ya?ml)$/.test(next)) await normalize(next)
  }
}
await walk('src/')
for (const file of ['tsconfig.json','tsconfig.client.json','tsdown.config.ts','pnpm-lock.yaml','pnpm-workspace.yaml','scripts/clean-build.mjs','scripts/git-artifacts.mjs']) await normalize(file)
