import {readFile,realpath,stat} from 'node:fs/promises'
import {join,resolve} from 'node:path'
import {createHash} from 'node:crypto'
import type {CommandRunner,RecoveryMaintenance,Task} from './types.ts'
import {verifyGitArtifacts} from '../git-artifacts.ts'

function repository(url:string):string{
 const value=new URL(url.trim().replace(/^git@github\.com:/i,'https://github.com/').replace(/^ssh:\/\/git@github\.com\//i,'https://github.com/'))
 if(value.hostname.toLowerCase()!=='github.com'||value.username||value.password||value.search||value.hash||!/^\/[\w.-]+\/[\w.-]+(?:\.git)?\/?$/.test(value.pathname))throw new Error('Maintenance origin must be an unambiguous GitHub repository')
 return value.pathname.slice(1).replace(/\.git\/?$/,'').replace(/\/$/,'')
}
const samePath=(a:string,b:string)=>process.platform==='win32'?a.toLowerCase()===b.toLowerCase():a===b
const sha=(value:string)=>{if(!/^[a-f0-9]{40}$/i.test(value))throw new Error('Invalid maintenance Git identity');return value}

/** Read-only handoff discovery. This never changes the consumer task's Git or provider identity. */
export async function inspectRecoveryMaintenance(task:Task,ownerRoot:string,loaded:{moduleSha256:string;build:unknown},run:CommandRunner):Promise<RecoveryMaintenance|undefined>{
 if(task.kind!=='recovery')throw new Error('Maintenance handoff requires recovery ownership')
 const worktree=resolve(task.worktree,'artifacts/maintenance/darkingdoom')
 try{await stat(worktree)}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT'){if(task.maintenanceHandoff)throw new Error('Recorded maintenance artifact is unavailable; retain its hold');return}throw error}
 const root=await realpath(task.worktree),actual=await realpath(worktree),owner=await realpath(ownerRoot)
 if(!samePath(root,resolve(task.worktree))||!samePath(actual,resolve(root,'artifacts/maintenance/darkingdoom')))throw new Error('Maintenance checkout escaped its owned workspace')
 const git=async(cwd:string,args:string[])=> (await run('git',args,{cwd,timeoutMs:10_000})).trim()
 if(!samePath(await realpath(await git(actual,['rev-parse','--show-toplevel'])),actual))throw new Error('Maintenance path is not its own repository')
 if(await git(root,['branch','--show-current'])!==task.branch||await git(root,['status','--porcelain'])||await git(root,['diff','--name-only',task.baseSha,'HEAD']))throw new Error('Consumer recovery identity changed or has mixed repository changes')
 const branch=await git(actual,['branch','--show-current'])
 if(!branch.startsWith(`recovery/${task.id.slice(0,8)}-`))throw new Error('Maintenance branch does not belong to this recovery owner')
 const expected=repository(await git(owner,['remote','get-url','origin']))
 for(const cwd of [owner,actual])for(const push of [false,true]){
  const urls=(await git(cwd,['remote','get-url',...(push?['--push']:[]),'--all','origin'])).split(/\r?\n/)
  if(!urls.length||urls.some(url=>repository(url).toLowerCase()!==expected.toLowerCase()))throw new Error('Maintenance origin does not match the loaded plugin repository')
 }
 if(await git(actual,['status','--porcelain']))throw new Error('Maintenance artifact is dirty')
 const headSha=sha(await git(actual,['rev-parse','HEAD'])),treeSha=sha(await git(actual,['rev-parse','HEAD^{tree}'])),ownerHead=sha(await git(owner,['rev-parse','HEAD']))
 const recorded=task.maintenanceHandoff
 if(recorded&&(!samePath(recorded.worktree,actual)||recorded.repository.toLowerCase()!==expected.toLowerCase()||recorded.branch!==branch||recorded.headSha!==headSha||recorded.treeSha!==treeSha))throw new Error('Recorded maintenance identity changed; retain its hold')
 let baseSha:string|undefined
 // The isolated checkout may not yet contain later documentation commits.
 // Require actual shared maintainer history without fetching or trusting prose.
 for(const candidate of (await git(owner,['log','-64','--format=%H'])).split(/\r?\n/)){
  try{await git(actual,['merge-base','--is-ancestor',sha(candidate),headSha]);baseSha=candidate;break}catch{continue}
 }
 if(!baseSha)throw new Error('Maintenance artifact has no verified maintainer lineage')
 if(recorded){await git(actual,['merge-base','--is-ancestor',sha(recorded.baseSha),headSha]);baseSha=recorded.baseSha}
 let incorporated=false
 try{await git(owner,['merge-base','--is-ancestor',headSha,ownerHead]);incorporated=true}catch{/* Not yet imported into the maintainer checkout. */}
 if(!incorporated&&baseSha===headSha)return
 let currentBuild:unknown
 try{currentBuild=verifyGitArtifacts(owner)}catch{/* Missing or stale source/output build proof remains false. */}
 let currentModule=''
 try{currentModule=createHash('sha256').update(await readFile(join(owner,'lib/captain/runtime.js'))).digest('hex')}catch{/* Missing compiled module remains unverified. */}
 const loadedNow=!!loaded.build&&!!currentBuild&&JSON.stringify(loaded.build)===JSON.stringify(currentBuild)&&loaded.moduleSha256===currentModule&&!await git(owner,['status','--porcelain'])
 if(!samePath(await realpath(worktree),actual)||await git(actual,['branch','--show-current'])!==branch||await git(actual,['rev-parse','HEAD'])!==headSha||await git(owner,['rev-parse','HEAD'])!==ownerHead||await git(actual,['status','--porcelain'])||(loadedNow&&await git(owner,['status','--porcelain']))||await git(root,['branch','--show-current'])!==task.branch||await git(root,['status','--porcelain'])||await git(root,['diff','--name-only',task.baseSha,'HEAD']))throw new Error('Maintenance identity changed during inspection')
 return {worktree:actual,repository:expected,branch,baseSha,headSha,treeSha,incorporated,loaded:loadedNow}
}
