import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,mkdir,writeFile,readFile,rm,realpath,rename,symlink} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,dirname} from 'node:path'
import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {inspectRecoveryMaintenance} from '../lib/captain/maintenance.js'
import {currentGitArtifacts} from '../lib/git-artifacts.js'
const git=(cwd,...args)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim()
const run=async(file,args,options)=>execFileSync(file,args,{cwd:options.cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']})
const fingerprint=async owner=>({moduleSha256:createHash('sha256').update(await readFile(join(owner,'lib/captain/runtime.js'))).digest('hex'),build:JSON.parse(await readFile(join(owner,'lib/git-artifact-stamp.json'),'utf8'))})
async function fixture(t){
 const dir=await realpath(await mkdtemp(join(tmpdir(),'maintenance-handoff-')));t.after(async()=>{assert.equal(await realpath(dir),dir);assert.equal(dirname(dir),await realpath(tmpdir()));await rm(dir,{recursive:true,force:true})})
 const owner=join(dir,'owner'),root=join(dir,'recovery');for(const p of [owner,root]){await mkdir(p);git(p,'init','-b','main');git(p,'config','core.autocrlf','false');git(p,'config','user.email','test@example.invalid');git(p,'config','user.name','Test')}
 for(const folder of ['src','scripts','lib/captain','lib/types/client'])await mkdir(join(owner,folder),{recursive:true})
 for(const file of ['tsconfig.json','tsconfig.client.json','tsdown.config.ts','pnpm-lock.yaml','pnpm-workspace.yaml','scripts/clean-build.mjs','scripts/git-artifacts.mjs','scripts/normalize-build-inputs.mjs','lib/captain.js','lib/client.js','lib/types/captain.d.ts','lib/types/client/captain-index.d.ts'])await writeFile(join(owner,file),'fixture\n')
 await writeFile(join(owner,'package.json'),'{"name":"fixture","version":"1.0.0"}\n');await writeFile(join(owner,'src/source.ts'),'old source\n');await writeFile(join(owner,'lib/captain/runtime.js'),'old module\n');await writeFile(join(owner,'lib/git-artifact-stamp.json'),JSON.stringify(currentGitArtifacts(owner)));git(owner,'add','.');git(owner,'commit','-m','base');git(owner,'remote','add','origin','https://github.com/Ihab-Zhaika/dsh-delivery-captain')
 await writeFile(join(root,'source.txt'),'consumer\n');git(root,'add','.');git(root,'commit','-m','consumer base');await writeFile(join(root,'.git/info/exclude'),'artifacts/\n')
 const artifact=join(root,'artifacts/maintenance/darkingdoom');await mkdir(dirname(artifact),{recursive:true});git(dir,'-c','core.autocrlf=false','clone',owner,artifact);git(artifact,'config','core.autocrlf','false');git(artifact,'remote','set-url','origin','https://github.com/Ihab-Zhaika/dsh-delivery-captain');git(artifact,'switch','-c','recovery/12345678-policy');git(artifact,'config','user.email','test@example.invalid');git(artifact,'config','user.name','Test')
 await writeFile(join(artifact,'src/source.ts'),'new source\n');await writeFile(join(artifact,'lib/captain/runtime.js'),'reviewed new module\n');await writeFile(join(artifact,'lib/git-artifact-stamp.json'),JSON.stringify(currentGitArtifacts(artifact)));git(artifact,'add','.');git(artifact,'commit','-m','actual plugin repair')
 const task={kind:'recovery',id:'12345678-rest',worktree:root,branch:'main',baseSha:git(root,'rev-parse','HEAD')},loaded=await fingerprint(owner)
 return {dir,owner,root,artifact,task,loaded,inspect:()=>inspectRecoveryMaintenance(task,owner,loaded,run)}
}
test('actual isolated plugin changes are a pending maintainer handoff while the consumer Git identity stays unchanged',async t=>{
 const f=await fixture(t),before=git(f.root,'rev-parse','HEAD'),result=await f.inspect()
 assert.equal(result.headSha,git(f.artifact,'rev-parse','HEAD'));assert.equal(result.treeSha,git(f.artifact,'rev-parse','HEAD^{tree}'));assert.equal(result.repository,'Ihab-Zhaika/dsh-delivery-captain');assert.equal(result.incorporated,false)
 assert.equal(git(f.root,'rev-parse','HEAD'),before);assert.equal(git(f.root,'status','--porcelain'),'');assert.equal(git(f.owner,'status','--porcelain'),'')
})
test('incorporation alone is insufficient until the matching compiled build is actually loaded',async t=>{
 const f=await fixture(t);git(f.owner,'fetch',f.artifact,'recovery/12345678-policy');git(f.owner,'merge','--ff-only','FETCH_HEAD')
 const pending=await f.inspect();assert.equal(pending.incorporated,true);assert.equal(pending.loaded,false)
 Object.assign(f.loaded,await fingerprint(f.owner));assert.equal((await f.inspect()).loaded,true)
})
test('foreign fetch or push repository identity is rejected',async t=>{
 const f=await fixture(t);git(f.artifact,'remote','set-url','--push','origin','https://github.com/foreign/other')
 await assert.rejects(f.inspect(),/does not match/)
})
test('dirty artifacts, wrong recovery owners and mixed consumer source cannot become handoffs',async t=>{
 const f=await fixture(t);await writeFile(join(f.artifact,'unreviewed.txt'),'unreviewed\n');await assert.rejects(f.inspect(),/dirty/);await rm(join(f.artifact,'unreviewed.txt'))
 git(f.artifact,'switch','-c','recovery/other-policy');await assert.rejects(f.inspect(),/recovery owner/);git(f.artifact,'switch','recovery/12345678-policy')
 await writeFile(join(f.root,'source.txt'),'unreviewed consumer change\n');await assert.rejects(f.inspect(),/mixed repository changes/)
})
test('a checkout junction outside the owned recovery root is rejected before Git inspection',async t=>{
 const f=await fixture(t),moved=join(f.dir,'escaped-artifact');assert.equal(dirname(moved),f.dir);await rename(f.artifact,moved);await symlink(moved,f.artifact,process.platform==='win32'?'junction':'dir')
 await assert.rejects(f.inspect(),/escaped/)
})
test('ordinary tasks cannot borrow the maintenance route and absent maintenance repositories remain ordinary',async t=>{
 const f=await fixture(t);await assert.rejects(inspectRecoveryMaintenance({...f.task,kind:undefined},f.owner,f.loaded,run),/recovery ownership/)
 assert.equal(dirname(f.artifact),join(f.root,'artifacts/maintenance'));await rm(f.artifact,{recursive:true,force:true});assert.equal(await f.inspect(),undefined)
})
test('a committed artifact change during inspection is rejected',async t=>{
 const f=await fixture(t);let seen=false
 const changing=async(file,args,options)=>{const value=await run(file,args,options);if(!seen&&options.cwd===f.artifact&&args.join(' ')==='rev-parse HEAD'){seen=true;await writeFile(join(f.artifact,'late.txt'),'late\n');git(f.artifact,'add','.');git(f.artifact,'commit','-m','late mutation')}return value}
 await assert.rejects(inspectRecoveryMaintenance(f.task,f.owner,f.loaded,changing),/identity changed/)
})
test('a clean source-only commit with stale compiled artifacts cannot claim a verified loaded repair',async t=>{
 const f=await fixture(t);git(f.owner,'fetch',f.artifact,'recovery/12345678-policy');git(f.owner,'merge','--ff-only','FETCH_HEAD');Object.assign(f.loaded,await fingerprint(f.owner))
 await writeFile(join(f.artifact,'src/source.ts'),'uncompiled repair\n');git(f.artifact,'add','.');git(f.artifact,'commit','-m','source-only repair');git(f.owner,'fetch',f.artifact,'recovery/12345678-policy');git(f.owner,'merge','--ff-only','FETCH_HEAD')
 assert.equal((await f.inspect()).loaded,false,'An unchanged saved stamp is insufficient; actual source/output digests must match')
})
test('a recorded pending handoff cannot disappear or change immutable Git identity during settlement',async t=>{
 const f=await fixture(t);f.task.maintenanceHandoff=await f.inspect();git(f.artifact,'reset','--hard',f.task.maintenanceHandoff.baseSha)
 await assert.rejects(f.inspect(),/recorded|identity/i)
 const moved=join(f.dir,'retained-old-artifact');assert.equal(dirname(moved),f.dir);await rename(f.artifact,moved);await assert.rejects(f.inspect(),/recorded|unavailable/i)
})
test('a maintainer source edit during the final load-proof barrier cannot be accepted as loaded',async t=>{
 const f=await fixture(t);git(f.owner,'fetch',f.artifact,'recovery/12345678-policy');git(f.owner,'merge','--ff-only','FETCH_HEAD');Object.assign(f.loaded,await fingerprint(f.owner));let reads=0
 const changing=async(file,args,options)=>{const value=await run(file,args,options);if(options.cwd===f.owner&&args.join(' ')==='rev-parse HEAD'&&++reads===2)await writeFile(join(f.owner,'src/source.ts'),'late owner change\n');return value}
 await assert.rejects(inspectRecoveryMaintenance(f.task,f.owner,f.loaded,changing),/identity changed/)
})
