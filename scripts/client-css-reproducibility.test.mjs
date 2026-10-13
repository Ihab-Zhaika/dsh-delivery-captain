import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, cp, readdir, readFile, writeFile, rm, realpath, symlink, lstat } from 'node:fs/promises'
import { openSync, closeSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve, join, basename } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'

const packageRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..')
const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
const configFiles=['package.json','pnpm-lock.yaml','pnpm-workspace.yaml','tsconfig.json','tsconfig.client.json','tsdown.config.ts','scripts/clean-build.mjs','scripts/git-artifacts.mjs','scripts/normalize-build-inputs.mjs']
async function files(dir,prefix=''){return(await readdir(dir,{withFileTypes:true})).flatMap(entry=>entry.isDirectory()?[{dir:join(dir,entry.name),prefix:prefix+entry.name+'/'}]:[{file:join(dir,entry.name),path:prefix+entry.name}])}
async function sourceFiles(){const result=[];const queue=[{dir:join(packageRoot,'src'),prefix:'src/'}];while(queue.length){for(const item of await files(queue[0].dir,queue[0].prefix)){if(item.dir)queue.push(item);else result.push(item.path)}queue.shift()}return[...result,...configFiles].sort()}
function canonicalBuild(root,log){
 assert.equal(basename(root),'checkout');assert.equal(basename(resolve(root,'lib')),'lib');assert.equal(dirname(resolve(root,'lib')),root)
 return new Promise((accept,reject)=>{
  const fd=openSync(log,'w'),child=spawn('pwsh',['-NoProfile','-Command','pnpm run build; exit $LASTEXITCODE'],{cwd:root,stdio:['ignore',fd,fd],windowsHide:true});let expired=false
  const timer=setTimeout(()=>{expired=true;child.kill();},120000)
  child.once('error',error=>{clearTimeout(timer);closeSync(fd);reject(error)})
  child.once('close',(code,signal)=>{clearTimeout(timer);closeSync(fd);if(expired)reject(new Error(`Owned canonical build timed out; fixture retained for exact process settlement ${root}`));else if(code!==0)reject(new Error(`Canonical build failed ${code}/${signal}; retained ${log}`));else accept({code,signal,root})})
 })
}
function cssModule(bundle){
 const css=/const css = ("(?:\\.|[^"\\])*");/.exec(bundle),map=/var \w+_default = (\{[^;]+\});/.exec(bundle)
 assert.ok(css,'Actual emitted CSS missing');assert.ok(map,'Actual emitted class map missing')
 return{css:JSON.parse(css[1]),map:JSON.parse(map[1])}
}
test('canonical CSS client and tracked source map are raw-byte reproducible across owned roots',{timeout:600000},async()=>{
 const parent=await mkdtemp(join(tmpdir(),'dsh-css-owned-')),roots=[join(parent,'root A','checkout'),join(parent,'different long root B العربية','checkout')]
 const archive=resolve(packageRoot,'../../recovery-d3d8f272/implementation-A',`css-${Date.now()}`);await mkdir(archive,{recursive:true});let completed=false
 const dependency=await realpath(join(packageRoot,'node_modules')),selected=await sourceFiles(),manifest=[]
 const inputBytes=new Map(await Promise.all(selected.map(async path=>[path,await readFile(join(packageRoot,path))])))
 try{
  for(const root of roots){await mkdir(root,{recursive:true});for(const path of selected){const from=join(packageRoot,path),to=join(root,path);await mkdir(dirname(to),{recursive:true});const bytes=inputBytes.get(path);assert.deepEqual(await readFile(from),bytes,'Source changed during fixture snapshot');await writeFile(to,bytes);manifest.push({root,path,sha256:hash(bytes)});assert.equal(hash(await readFile(to)),hash(bytes))}await symlink(dependency,join(root,'node_modules'),process.platform==='win32'?'junction':'dir')}
  await writeFile(join(archive,'snapshot.json'),JSON.stringify({packageRoot,dependency,node:process.version,platform:process.platform,roots,manifest},null,2))
  const outputs=[]
  for(let round=0;round<2;round++)for(let index=0;index<2;index++){
   const root=roots[index],receipt=await canonicalBuild(root,join(archive,`root-${index}-round-${round}.log`))
   const bundle=await readFile(join(root,'lib/client.js')),map=await readFile(join(root,'lib/client.js.map')),stamp=JSON.parse(await readFile(join(root,'lib/git-artifact-stamp.json'),'utf8'))
   const verifier=await import(pathToFileURL(join(root,'scripts/git-artifacts.mjs')).href);assert.deepEqual(verifier.verifyGitArtifacts(root),stamp)
   const parsed=cssModule(bundle.toString()),mapJson=JSON.parse(map);assert.equal(mapJson.version,3);assert.equal(mapJson.file,'client.js');assert.ok(Array.isArray(mapJson.sourcesContent));assert.ok(typeof mapJson.mappings==='string')
   for(const value of Object.values(parsed.map))assert.ok(parsed.css.includes('.'+value),`Class-map value missing from CSS: ${value}`)
   await writeFile(join(archive,`root-${index}-round-${round}.client.js`),bundle);await writeFile(join(archive,`root-${index}-round-${round}.client.js.map`),map)
   outputs.push({receipt,bundle,map,stamp,css:parsed.css,classes:parsed.map});await writeFile(join(archive,'outputs.json'),JSON.stringify(outputs.map(o=>({receipt:o.receipt,bundleSha:hash(o.bundle),mapSha:hash(o.map),stamp:o.stamp,cssSha:hash(o.css),classes:o.classes})),null,2))
  }
  // All four canonical builds finish before raw assertions; RED cannot be a missing build/setup.
  for(const output of outputs.slice(1)){assert.deepEqual(output.bundle,outputs[0].bundle,'Raw entire client.js differs by checkout root');assert.deepEqual(output.map,outputs[0].map,'Raw tracked client.js.map differs by checkout root');assert.deepEqual(output.stamp,outputs[0].stamp);assert.equal(output.css,outputs[0].css);assert.deepEqual(output.classes,outputs[0].classes)}
  for(const output of outputs){const text=output.bundle.toString();for(const root of roots)assert.ok(!text.includes(root)&&!text.includes(root.replaceAll('\\','/')));assert.match(text,/dsh-css:src\/client\/CaptainPanel\.module\.css\.mjs/)}
  const modules=await Promise.all(roots.map(root=>import(pathToFileURL(join(root,'tsdown.config.ts')).href)))
  for(let i=0;i<2;i++){
   const root=roots[i],plugin=modules[i].default.plugins.find(p=>p.name==='dsh-css-modules-inline'),watched=[],source=join(root,'src/client/CaptainPanel.module.css'),importer=join(root,'lib/client/CaptainPanel.js')
   const id=plugin.resolveId('./CaptainPanel.module.css',importer);const body=await plugin.load.call({addWatchFile:path=>watched.push(path)},id);assert.equal(watched[0],source);assert.match(body,/const css =/)
   const other=join(root,'src/other/CaptainPanel.module.css');await mkdir(dirname(other),{recursive:true});await cp(source,other);const otherId=plugin.resolveId('./CaptainPanel.module.css',join(root,'lib/other/module.js'));assert.notEqual(otherId,id)
   const otherBody=await plugin.load.call({addWatchFile(){}},otherId);assert.notEqual(otherBody,body,'Different repository module paths must not share class identity')
   await assert.rejects(plugin.load.call({addWatchFile(){}},'\0dsh-css:src/missing.module.css.mjs'));assert.throws(()=>plugin.resolveId('../../../../outside.module.css',importer))
   const normalize=modules[i].cssRelativeIdentity
   assert.equal(normalize('C:\\repo','C:\\repo\\src\\A.module.css'),'src/A.module.css');assert.equal(normalize('/repo','/repo/src/A.module.css'),'src/A.module.css');assert.throws(()=>normalize('C:\\repo','C:\\foreign\\A.module.css'));assert.throws(()=>normalize('/repo','/repo/../outside.module.css'))
   assert.throws(()=>plugin.resolveId('./missing.module.css',importer));await assert.rejects(plugin.load.call({addWatchFile(){}},id+'invalid'));assert.throws(()=>plugin.resolveId('./CaptainPanel.module.css',undefined))
   const outside=join(parent,'outside.module.css'),linked=join(root,'src/client/linked.module.css');await writeFile(outside,'.local { color: red; }');await symlink(outside,linked);assert.throws(()=>plugin.resolveId('./linked.module.css',importer));await rm(linked)
   // Unknown virtual IDs must never trigger read/watch or guess a filesystem counterpart.
   let watchedUnknown=false;await assert.rejects(plugin.load.call({addWatchFile(){watchedUnknown=true}},'\0dsh-css:src/client/../foreign.module.css.mjs'));assert.equal(watchedUnknown,false)
  }
  completed=true
  await writeFile(join(archive,'settlement.json'),JSON.stringify({canonicalCalls:4,allNativeExitZero:true,rawClientEqual:true,rawTrackedMapEqual:true,sameStampAcrossRoots:true,dependencyTarget:dependency,ownedRoots:roots,hostPlatform:process.platform,cleanupEligible:true},null,2))
 }finally{
  // Failed/timeout roots and full output receipts remain for diagnosis; never delete a possibly running child range.
  if(completed){for(const root of roots){assert.equal(await realpath(root),root);assert.equal((await lstat(join(root,'node_modules'))).isSymbolicLink(),true);await rm(join(root,'node_modules'));await rm(root,{recursive:true,force:true})}assert.equal(dirname(parent),await realpath(tmpdir()));await rm(parent,{recursive:true,force:true})}
 }
})
