import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,mkdir,writeFile,readFile,rm,realpath,symlink,readdir} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,dirname} from 'node:path'
import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {reviewMaintenanceRange} from '../lib/captain/maintenance-review.js'
const git=(cwd,...args)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim()
const runner=async(file,args,options)=>execFileSync(file,args,{cwd:options.cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']})
async function fixture(t){
 const root=await realpath(await mkdtemp(join(tmpdir(),'maintenance-review-')));t.after(async()=>{assert.equal(await realpath(root),root);assert.equal(dirname(root),await realpath(tmpdir()));await rm(root,{recursive:true,force:true})})
 git(root,'init','-b','main');git(root,'config','core.autocrlf','false');git(root,'config','user.email','test@example.invalid');git(root,'config','user.name','Fixture')
 await mkdir(join(root,'src/captain'),{recursive:true});await mkdir(join(root,'lib'));await writeFile(join(root,'.gitignore'),'.captain-smoke/\n');await writeFile(join(root,'src/captain/runtime.ts'),'  original context with whitespace  \n');await writeFile(join(root,'lib/client.js.map'),'unchanged required map context\n');git(root,'add','.');git(root,'commit','-m','base');const base=git(root,'rev-parse','HEAD')
 git(root,'switch','-c','feature');await writeFile(join(root,'src/captain/runtime.ts'),'  changed context with whitespace  \n');await writeFile(join(root,'lib/generated.js'),'x'.repeat(8000)+'\n');await writeFile(join(root,'notes.md'),'Docs change\n');git(root,'add','.');git(root,'commit','-m','repair')
 return{root,base,head:git(root,'rev-parse','HEAD'),signal:new AbortController().signal}
}
test('maintenance primary snapshots retain full changed paths and required source context under their own captured budget',async t=>{
 const f=await fixture(t);let input
 const result=await reviewMaintenanceRange(f.root,f.base,f.head,5_000_000,runner,async value=>{input=value;for(const path of value.paths){const bytes=await readFile(path.snapshotPath);assert.equal(createHash('sha256').update(bytes).digest('hex'),path.fingerprint)}return{report:'Fixture transport receipt only; no live semantic approval claimed',findings:[],reviewerSessionId:'fixture-reader'}},f.signal)
 assert.equal(result.passed,true);assert.equal(input.baseSha,f.base);assert.equal(input.headSha,f.head);assert.equal(input.treeSha,git(f.root,'rev-parse','HEAD^{tree}'));assert.equal(input.maxTokensBudget,5_000_000)
 assert.deepEqual(input.paths.map(p=>p.path).sort(),['lib/client.js.map','lib/generated.js','notes.md','src/captain/runtime.ts'])
 assert.match(await readFile(input.paths.find(p=>p.path==='src/captain/runtime.ts').snapshotPath,'utf8'),/Full required current source context:\n  changed context with whitespace  \n/)
 assert.match(await readFile(input.paths.find(p=>p.path==='lib/generated.js').snapshotPath,'utf8'),/darkingdoom\.review-snapshot-json\/v1/)
 assert.equal(git(f.root,'status','--porcelain'),'');assert.ok(await readFile(join(result.directory,'input.json')));assert.ok(await readFile(join(result.directory,'result.json')))
})
test('stale head, dirty checkout and empty range refuse native review admission',async t=>{
 const f=await fixture(t);let calls=0;const adapter=async()=>{calls++;throw Error('Must not start')}
 assert.equal((await reviewMaintenanceRange(f.root,f.base,f.base,5_000_000,runner,adapter,f.signal)).passed,false)
 assert.equal((await reviewMaintenanceRange(f.root,f.head,f.head,5_000_000,runner,adapter,f.signal)).passed,false)
 await writeFile(join(f.root,'notes.md'),'uncommitted\n');assert.equal((await reviewMaintenanceRange(f.root,f.base,f.head,5_000_000,runner,adapter,f.signal)).passed,false);assert.equal(calls,0)
})
test('changed source after a native receipt prevents adoption while retaining immutable evidence',async t=>{
 const f=await fixture(t);const result=await reviewMaintenanceRange(f.root,f.base,f.head,5_000_000,runner,async()=>{await writeFile(join(f.root,'notes.md'),'changed during review\n');return{report:'Fixture prior native report',findings:[],reviewerSessionId:'fixture-reader'}},f.signal)
 assert.equal(result.passed,false);assert.match(result.findings.join(' '),/changed/);assert.equal(result.reviewerSessionId,'fixture-reader');assert.match(result.report,/Fixture prior native report/);assert.ok(await readFile(join(result.directory,'input.json')));assert.ok(await readFile(join(result.directory,'result.json')))
})
test('an ignored snapshot-parent junction is rejected before creating or persisting outside its namespace',async t=>{
 const f=await fixture(t),target=join(f.root,'escaped');await mkdir(target);await symlink(target,join(f.root,'.captain-smoke'),process.platform==='win32'?'junction':'dir');let calls=0
 const result=await reviewMaintenanceRange(f.root,f.base,f.head,5_000_000,runner,async()=>{calls++;throw Error('Must not start')},f.signal)
 assert.equal(result.passed,false);assert.deepEqual(await readdir(target),[]);assert.equal(calls,0)
})
test('budget or cancellation failure is incomplete evidence, never a replacement pass',async t=>{
 const f=await fixture(t);const result=await reviewMaintenanceRange(f.root,f.base,f.head,5_000_000,runner,async()=>{throw Error('Independent review token budget exceeded')},f.signal)
 assert.equal(result.passed,false);assert.match(result.report,/budget exceeded/);assert.equal(result.reviewerSessionId,undefined);assert.ok(await readFile(join(result.directory,'result.json')))
})
