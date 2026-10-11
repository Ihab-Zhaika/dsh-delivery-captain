import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('DarKingDoom owns distinct public identities and does not export the original AgentTeams executable', async () => {
  const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'))
  const patch=await readFile(new URL('../cordis.patch.yml',import.meta.url),'utf8')
  const host=await readFile(new URL('../src/captain.ts',import.meta.url),'utf8')
  const client=await readFile(new URL('../src/client/captain-index.tsx',import.meta.url),'utf8')
  const panel=await readFile(new URL('../src/client/CaptainPanel.tsx',import.meta.url),'utf8')
  assert.equal(pkg.name,'@ihab-zhaika/dsh-darkingdoom')
  assert.equal(pkg.bin?.['dsh-agent-teams-doctor'],undefined)
  assert.match(patch,/id: darkingdoom/)
  assert.doesNotMatch(patch,/id: agent-teams/)
  assert.match(host,/export const name = 'darkingdoom'/)
  assert.match(host,/name: 'darkingdoom_status'/)
  assert.match(host,/name: 'darkingdoom'/)
  assert.match(client,/>DarKingDoom Plugin<\/button>/)
  assert.match(panel,/>DarKingDoom Plugin<\/h1>/)
  assert.doesNotMatch(client+panel,/Delivery Captain/)
})
