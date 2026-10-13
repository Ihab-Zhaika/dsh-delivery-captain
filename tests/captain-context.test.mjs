import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
const exec = promisify(execFile)
const api = await import('../src/captain/repository-context.ts').catch(() => ({}))

test('repository configuration is discovered from the session repository, not the plugin directory', async () => {
  assert.equal(typeof api.discoverRepository, 'function')
  const root = await mkdtemp(join(tmpdir(), 'darkingdoom-context-'))
  try {
    await exec('git', ['init', root])
    for (const [remote, url] of [['origin','https://user@dev.azure.com/acme/Delivery/_git/Product'], ['github','git@github.com:owner/product.git']]) {
      await exec('git', ['remote','add',remote,url], {cwd:root})
      await exec('git', ['symbolic-ref',`refs/remotes/${remote}/HEAD`,`refs/remotes/${remote}/trunk`], {cwd:root})
    }
    await mkdir(join(root,'docs/delivery/azure-devops'), {recursive:true})
    await mkdir(join(root,'scripts'), {recursive:true})
    await mkdir(join(root,'src/Web'), {recursive:true})
    await writeFile(join(root,'docs/delivery/azure-devops/README.md'), '> Retired. GitHub is now the only tracker.')
    await writeFile(join(root,'docs/delivery/azure-devops/plan.json'), JSON.stringify({milestones:[{name:'M0 Foundations'},{name:'M1 Product'}]}))
    await writeFile(join(root,'scripts/ci-local.ps1'), 'throw "Discovery must never execute repository scripts"')
    const runner = async (file,args,options) => {
      if(file === 'git' && args[0] === 'ls-remote') return 'ref: refs/heads/trunk\tHEAD\n'
      if(file === 'git') return (await exec(file,args,options)).stdout
      if(file === 'gh') return JSON.stringify([{title:'M1 Product'},{title:'M0 Foundations'}])
      if(file === 'az') return JSON.stringify({name:'Delivery',path:'\\Delivery',children:[{name:'Product',path:'\\Delivery\\Iteration\\Product',children:[{name:'M1 Product',path:'\\Delivery\\Iteration\\Product\\M1 Product'},{name:'M0 Foundations',path:'\\Delivery\\Iteration\\Product\\M0 Foundations'}]}]})
      assert.fail(`Unexpected execution ${file}`)
    }
    const context = await api.discoverRepository(join(root,'src/Web'), undefined, runner)
    assert.equal(context.config.workspace, root)
    assert.equal(context.config.provider, 'github')
    assert.equal(context.config.repository, 'owner/product')
    assert.equal(context.config.remote, 'github')
    assert.equal(context.config.targetBranch, 'trunk')
    assert.deepEqual(context.config.milestones,['M0 Foundations','M1 Product'])
    assert.deepEqual(context.config.verifyCommands,['pwsh -NoProfile -File scripts/ci-local.ps1'])
    const azure = await api.discoverRepository(root, 'azure', runner)
    assert.equal(azure.config.organization, 'https://dev.azure.com/acme')
    assert.equal(azure.config.project, 'Delivery')
    assert.equal(azure.config.repository, 'Product')
    assert.equal(azure.config.remote,'origin')
    assert.deepEqual(azure.config.milestones,['Delivery\\Product\\M0 Foundations','Delivery\\Product\\M1 Product'])
    assert.throws(() => api.bindRepositoryConfig(context,{...context.config,workspace:tmpdir()}), /current session repository/)
    assert.throws(() => api.bindRepositoryConfig(context,{...context.config,repository:'someone/else'}), /current session repository/)
    assert.equal(api.bindRepositoryConfig(context,{parallelism:7}).parallelism,7)
    assert.throws(()=>api.bindRepositoryConfig(azure,{milestones:['M0 Foundations']}),/provider catalog/)
    await mkdir(join(root,'docs/delivery/github'),{recursive:true})
    await writeFile(join(root,'docs/delivery/github/plan.json'),JSON.stringify({milestones:['M0 GitHub only']}))
    const azureWithBothPlans=await api.discoverRepository(root,'azure',runner)
    assert.deepEqual(azureWithBothPlans.config.milestones,azure.config.milestones)
    assert.equal(azureWithBothPlans.milestoneSource,'docs/delivery/azure-devops/plan.json')
  } finally { await rm(root,{recursive:true,force:true}) }
})

test('missing remote branch and failed catalogs are visible instead of invented defaults', async () => {
  assert.equal(typeof api.discoverRepository,'function')
  const root = await mkdtemp(join(tmpdir(),'darkingdoom-context-'))
  try {
    await exec('git',['init',root])
    await exec('git',['remote','add','origin','https://github.com/owner/product'],{cwd:root})
    await writeFile(join(root,'package.json'),JSON.stringify({packageManager:'pnpm@10',scripts:{typecheck:'tsc',test:'node --test'}}))
    const runner = async(file,args,options) => {
      if(file==='git' && args[0]!=='ls-remote')return (await exec(file,args,options)).stdout
      throw new Error('unavailable')
    }
    const context=await api.discoverRepository(root,undefined,runner)
    assert.equal(context.config.targetBranch,'')
    assert.deepEqual(context.config.milestones,[])
    assert.deepEqual(context.config.verifyCommands,['pnpm run typecheck','pnpm run test'])
    assert.ok(context.warnings.some(x=>/default branch/i.test(x)))
    assert.ok(context.warnings.some(x=>/milestone/i.test(x)))
    await assert.rejects(api.discoverRepository(root,'azure',runner),/Azure DevOps remote/)
  } finally { await rm(root,{recursive:true,force:true}) }
})

test('nested pnpm verification uses its supported directory option', async () => {
  const root = await mkdtemp(join(tmpdir(),'darkingdoom-context-'))
  try {
    await exec('git',['init',root])
    await exec('git',['remote','add','origin','https://github.com/owner/product'],{cwd:root})
    await mkdir(join(root,'src/Web'),{recursive:true})
    await writeFile(join(root,'src/Web/package.json'),JSON.stringify({packageManager:'pnpm@10',scripts:{typecheck:'tsc',test:'vitest run'}}))
    const runner=async(file,args,options)=>{
      if(file==='git' && args[0]==='ls-remote')return 'ref: refs/heads/main\tHEAD\n'
      if(file==='git')return (await exec(file,args,options)).stdout
      return JSON.stringify([{title:'M0'}])
    }
    const context=await api.discoverRepository(root,undefined,runner)
    assert.deepEqual(context.config.verifyCommands,['pnpm --dir src/Web run typecheck','pnpm --dir src/Web run test'])
  } finally { await rm(root,{recursive:true,force:true}) }
})
