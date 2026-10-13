/** Record and verify source/build-output digests for script-free Git installation. */
import { realpathSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {currentGitArtifacts,verifyGitArtifacts} from '../lib/git-artifacts.js'
export {verifyGitArtifacts}

const STAMP = 'lib/git-artifact-stamp.json'
export function writeGitArtifactStamp(root) {
  writeFileSync(join(root, STAMP), JSON.stringify(currentGitArtifacts(root), null, 2) + '\n')
}
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const root = dirname(dirname(fileURLToPath(import.meta.url)))
  if (process.argv[2] === '--write') writeGitArtifactStamp(root)
  else { verifyGitArtifacts(root); console.log('Git artifacts match source and build settings.') }
}
