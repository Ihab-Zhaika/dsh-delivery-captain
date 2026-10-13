import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile,mkdtemp,writeFile,rm,stat,realpath} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,dirname} from 'node:path'
import {pathToFileURL} from 'node:url'
import {createRequire} from 'node:module'
import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {reviewTask,formatReviewSnapshot} from '../lib/captain/review.js'

const resolveHost=createRequire(await realpath(new URL('../node_modules/@deepseek-ai/dsh/package.json',import.meta.url)))
const nativeFs=await import(pathToFileURL(resolveHost.resolve('@deepseek-ai/dsh-tool-fs')).href)
function nativeReader(){
 const tools=new Map(),ctx={tools:{register:tool=>tools.set(tool.name,tool)},systemPrompt:{section(){},getSectionOrder(){return 0}},inject(){},emit(){},fs:{
  async resolve(path){return{displayPath:path}},async stat(target){const info=await stat(target.displayPath);return{type:'file',size:info.size}},async readText(target){return readFile(target.displayPath,'utf8')},async *streamText(target){yield await readFile(target.displayPath,'utf8')}
 }}
 nativeFs.apply(ctx,{readLimit:2000,readMaxLineLength:2000,readMaxBytes:50*1024,readStreamMinSize:64*1024})
 return tools.get('read')
}
const git=(root,...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim()
test('generated long-line snapshots are fully inspectable by the actual native reader with its default caps',async t=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),'snapshot-caps-')));t.after(async()=>{assert.equal(await realpath(root),root);assert.equal(dirname(root),await realpath(tmpdir()));await rm(root,{recursive:true,force:true})});git(root,'init','-b','main');git(root,'config','user.email','test@example.invalid');git(root,'config','user.name','Test');await writeFile(join(root,'bundle.js'),'const old = true;\n');git(root,'add','.');git(root,'commit','-m','Base');git(root,'remote','add','origin',root);const base=git(root,'rev-parse','HEAD');git(root,'switch','-c','work')
 const code=`const css = ${JSON.stringify('.a{content:"😀\\x";}'.repeat(9000))};\n`;await writeFile(join(root,'bundle.js'),code);git(root,'add','.');git(root,'commit','-m','Generated long line')
 const runner=async(file,args,options)=>execFileSync(file,args,{cwd:options?.cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}),reader=nativeReader()
 const result=await reviewTask({id:'t',ticket:{title:'Generated change',body:'Inspect the complete bundle'},branch:'work',worktree:root,baseSha:base,startedAt:new Date().toISOString()},{remote:'origin',targetBranch:'main',maxTaskMinutes:5,reviewBackend:'agent',verifyCommands:[]},runner,undefined,undefined,async input=>{
  assert.equal(input.paths.length,1);const selected=input.paths[0],bytes=await readFile(selected.snapshotPath),expected=bytes.toString().split('\n');if(bytes.toString().endsWith('\n'))expected.pop();const seen=[];let offset=1
  while(seen.length<expected.length){const value=await reader.execute({file_path:selected.snapshotPath,offset},{signal:new AbortController().signal});const meta=reader.output.presentationMeta({},value);assert.equal(meta.totalLines,expected.length);assert.ok(meta.lines.length,'Native read must make progress');for(const line of meta.lines){assert.equal(line.text,expected[line.number-1].replace(/\r$/,''),'Native read must return the complete physical snapshot line');seen.push(line.number)}offset=meta.lines.at(-1).number+1}
  assert.deepEqual(seen,expected.map((_,i)=>i+1));assert.equal(createHash('sha256').update(bytes).digest('hex'),selected.fingerprint)
  const text=bytes.toString();if(text.includes('darkingdoom.review-snapshot-json/v1')){const metadata=JSON.parse(expected[1]);const records=expected.slice(3).map(JSON.parse);let reconstructed='',next=0;for(const record of records){assert.equal(record.offset,next);reconstructed+=record.text;next+=record.text.length}assert.equal(createHash('sha256').update(reconstructed).digest('hex'),metadata.rawSha256);assert.equal(Buffer.byteLength(reconstructed),metadata.rawUtf8Bytes);assert.ok(reconstructed.includes(code.trim()))}
  return{report:'Complete native paginated snapshot read',findings:[],reviewerSessionId:'reviewer'}
 })
 assert.equal(result.passed,true,result.report)
})

test('snapshot framing round-trips controls, CRLF and split Unicode pairs without exceeding native line caps',()=>{
 for(const raw of ['a'.repeat(199)+'😀'+('\u0000\t\\\"'.repeat(800))+'\r\nTail\r\n',('x'.repeat(1601)+'\r\n').repeat(5)+'no trailing newline']){
  const encoded=formatReviewSnapshot(raw),lines=encoded.trimEnd().split('\n'),metadata=JSON.parse(lines[1]);let restored='',offset=0
  for(const line of lines.slice(3)){assert.ok(line.length<2000);const record=JSON.parse(line);assert.equal(record.offset,offset);restored+=record.text;offset+=record.text.length}
  assert.equal(restored,raw);assert.equal(metadata.rawUtf8Bytes,Buffer.byteLength(raw));assert.equal(metadata.rawSha256,createHash('sha256').update(raw).digest('hex'))
 }
})
test('ordinary readable snapshots retain their original diff and line-number presentation',()=>{
 const raw='Immutable independent review snapshot\n@@ -1 +1 @@\n-old\n+new\n';assert.equal(formatReviewSnapshot(raw),raw)
})
