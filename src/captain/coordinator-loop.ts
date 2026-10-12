import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { CoordinatorLoopAction, CoordinatorLoopState, Run } from './types.ts'

interface GoalView {
  id:string; revision:number; objective:string; phase:'active'|'paused'|'blocked'|'complete';
  activation:'armed'|'disarmed'; roundsStarted:number; maxGoalRounds:number; blockedReason?:{code:string;message:string};
}
interface GoalService {
  get(agent:Agent):GoalView|undefined;
  create(agent:Agent,request:{objective:string}):GoalView;
  resume(agent:Agent,ref:GoalView):GoalView;
  pause(agent:Agent,ref:GoalView):GoalView;
  complete(agent:Agent,ref:GoalView):GoalView;
  disarm(agent:Agent):GoalView|undefined;
}

/** Native same-session goal ownership; never implements a second polling loop. */
export class CoordinatorLoop {
  private readonly ctx:Context
  constructor(ctx:Context) {this.ctx=ctx}
  private service():GoalService {
    const goals=this.ctx.get('goals') as GoalService|undefined
    if(!goals||!['get','create','resume','pause','complete','disarm'].every(key=>typeof (goals as unknown as Record<string,unknown>)[key]==='function'))throw new Error('DSH native goal service and goal-round driver must be installed for coordinator loop mode')
    return goals
  }
  private owned(run:Run,goal:GoalView|undefined):boolean {
    return !!goal&&goal.id===run.coordinatorGoalId&&goal.objective.includes(`DarKingDoom run ${run.id}\n`)
  }
  state(run:Run):CoordinatorLoopState {
    try {
      const agent=this.ctx.agents.get(run.captainSessionId as SessionId)
      if(!agent)return {status:run.coordinatorGoalId?'unavailable':'not-started'}
      const goal=this.service().get(agent)
      if(!this.owned(run,goal))return{status:'not-started'}
      return {status:run.coordinatorWaiting&&goal!.phase==='active'&&goal!.activation==='disarmed'?'waiting':goal!.phase,id:goal!.id,phase:goal!.phase,activation:goal!.activation,roundsStarted:goal!.roundsStarted,maxGoalRounds:goal!.maxGoalRounds,...goal!.blockedReason?{reason:goal!.blockedReason.message}:{}}
    }catch(error){return{status:'unavailable',reason:String(error)}}
  }
  async control(run:Run,action:CoordinatorLoopAction):Promise<void> {
    const goals=this.service()
    const revision=run.coordinatorRevision,status=run.status
    let agent=this.ctx.agents.get(run.captainSessionId as SessionId)
    if(!agent&&['start','resume'].includes(action)) {
      const result=await this.ctx.sessionController.resolveAgent(run.captainSessionId as SessionId)
      if('error' in result)throw new Error(`Cannot activate coordinator loop: ${String(result.error)}`)
      if(run.coordinatorRevision!==revision||run.status!==status)throw new Error('Run changed while activating its coordinator loop')
      agent=result.agent
    }
    if(!agent)return
    let goal=goals.get(agent)
    if(action==='start'||action==='resume') {
      if(goal&&goal.phase!=='complete'&&!this.owned(run,goal))throw new Error('Coordinator has an unrelated unfinished native goal; it cannot be overwritten')
      if(!goal||goal.phase==='complete') {
        goal=goals.create(agent,{objective:`DarKingDoom run ${run.id}\nLead this repository delivery run in the SAME coordinator chat. Use darkingdoom_status and original AgentTeams to coordinate workers, resolve actionable blockers and collect genuine reports. The controller owns intake, worktrees, verification, PR merge and closure. Respect the current ticket selection, admission cap, dependencies, milestones, parked-task holds and all acceptance/security gates. Never implement worker scope in the main checkout. Do not repeatedly prompt waiting or parked workers. When only waiting remains, call darkingdoom_wait to wait quietly for new coordinator events. A single blocked/parked ticket does not stop other eligible work. Continue leading until the run is stopped or its bounded delivery scope finishes; only then is this goal complete.`})
        run.coordinatorGoalId=goal.id
      }else if(goal.phase!=='active'||goal.activation!=='armed')goals.resume(agent,goal)
      delete run.coordinatorWaiting
      return
    }
    if(!this.owned(run,goal))return
    if(action==='wake') {
      if(run.status==='running'&&run.coordinatorWaiting&&goal!.phase==='active') {if(goal!.activation==='disarmed')goals.resume(agent,goal!);delete run.coordinatorWaiting}
      return
    }
    if(action==='wait') {if(goal!.phase==='active'){run.coordinatorWaiting=true;goals.disarm(agent)};return}
    delete run.coordinatorWaiting
    if(action==='shutdown'){goals.disarm(agent);return}
    if(action==='pause'){if(goal!.phase==='active')goals.pause(agent,goal!);else goals.disarm(agent);return}
    if(action==='stop'&&goal!.phase!=='complete')goals.complete(agent,goal!)
  }
}
