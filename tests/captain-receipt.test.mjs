import test from 'node:test'
import assert from 'node:assert/strict'
const api=await import('../src/captain/team-receipt.ts').catch(()=>({}))
const args={approval:'automatic',description:'Delivery task task1',name:'Original team'}
const call={type:'tool/call',seq:1,data:{callId:'c1',name:'agent_teams_create',arguments:JSON.stringify(args)}}
const result={type:'tool/result',seq:2,sourceEventSeqs:[1],data:{message:{toolCallId:'c1',isError:false,content:[]},meta:{team_id:'original-team',team_name:'Original team',captain_session_id:'worker'}}}
const inspection=(events=[call,result],inheritedEventCount=0)=>({meta:{id:'worker'},events,inheritedEventCount})
test('genuine native success receipts bind original creation to this worker and task',()=>{
  assert.equal(typeof api.originalTeamReceipt,'function')
  assert.deepEqual(api.originalTeamReceipt(inspection(),'worker','task1'),{id:'original-team',name:'Original team'})
  assert.equal(api.originalTeamReceipt(inspection([],0),'worker','task1'),undefined)
  assert.equal(api.originalTeamReceipt(inspection([call,result],3),'worker','task1'),undefined)
  assert.throws(()=>api.originalTeamReceipt({...inspection(),meta:{id:'another'}},'worker','task1'),/identity/)
  for(const changed of [{sourceEventSeqs:[]},{data:{...result.data,message:{...result.data.message,isError:true}}},{data:{...result.data,meta:{...result.data.meta,captain_session_id:'other'}}}])assert.equal(api.originalTeamReceipt(inspection([call,{...result,...changed}]),'worker','task1'),undefined)
  assert.equal(api.originalTeamReceipt(inspection([{...call,data:{...call.data,arguments:JSON.stringify({...args,approval:'required'})}},result]),'worker','task1'),undefined)
  assert.equal(api.originalTeamReceipt(inspection([{...call,data:{...call.data,name:'run_code'}},result]),'worker','task1'),undefined)
  assert.equal(api.originalTeamReceipt(inspection([call,{...result,data:{...result.data,meta:{...result.data.meta,team_name:'Unrelated team'}}}]),'worker','task1'),undefined)
  assert.deepEqual(api.originalTeamReceipt(inspection([{...call,data:{...call.data,arguments:JSON.stringify({...args,name:' Original team '})}},result]),'worker','task1'),{id:'original-team',name:'Original team'})
})
test('PTC requires genuine paired dispatches rather than trusting printed run_code text',()=>{
  const root={type:'tool/call',seq:1,data:{callId:'root',name:'run_code',arguments:'{}'}}
  const data={rootCallId:'root',parentCallId:'root',subCallId:'sub',name:'agent_teams_create',arguments:args}
  const start={type:'tool/ptc-dispatch-start',seq:2,data}
  const end={type:'tool/ptc-dispatch',seq:3,data:{...data,isError:false,content:[{type:'text',text:'Team "Original team" created (id original-team) under C:/worktree. You are the captain.'}]}}
  assert.deepEqual(api.originalTeamReceipt(inspection([root,start,end]),'worker','task1'),{id:'original-team',name:'Original team'})
  assert.equal(api.originalTeamReceipt(inspection([root,end]),'worker','task1'),undefined)
  assert.equal(api.originalTeamReceipt(inspection([root,start,{...end,data:{...end.data,parentCallId:'fake'}}]),'worker','task1'),undefined)
  assert.equal(api.originalTeamReceipt(inspection([root,start,{...end,data:{...end.data,isError:true}}]),'worker','task1'),undefined)
})
