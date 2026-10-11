import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-tools'

interface Inspection { meta: { id: string }; inheritedEventCount: number; events: readonly SessionEvent[] }
interface Receipt { id: string; name: string }
function object(value: unknown): Record<string, unknown> | undefined { return value && typeof value==='object' && !Array.isArray(value) ? value as Record<string,unknown> : undefined }
function argumentsObject(value: unknown) { try { return object(typeof value==='string'?JSON.parse(value):value) } catch { return undefined } }
function scoped(value: unknown, taskId: string): boolean {
  const args=argumentsObject(value)
  const marker=taskId.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')
  return args?.approval==='automatic' && typeof args.description==='string' && new RegExp(`(?:^|\\s)Delivery task ${marker}(?![\\w-])`).test(args.description)
}

/** Public native tool journals prove execution; optional plugin events are not reconstructed by rc.2. */
export function originalTeamReceipt(inspection: Inspection, workerId: string, taskId: string): Receipt | undefined {
  if(inspection.meta.id!==workerId)throw new Error('Worker inspection identity mismatch')
  const calls=new Map<string,Extract<SessionEvent,{type:'tool/call'}>>()
  const nested=new Map<string,Extract<SessionEvent,{type:'tool/ptc-dispatch-start'}>>()
  let receipt: Receipt | undefined
  for(const event of inspection.events) {
    if(event.seq<inspection.inheritedEventCount)continue
    if(event.type==='tool/call') { calls.set(event.data.callId,event); continue }
    if(event.type==='tool/result') {
      const call=calls.get(event.data.message.toolCallId)
      const meta=object(event.data.meta)
      if(!call || call.data.name!=='agent_teams_create' || call.seq>=event.seq || !event.sourceEventSeqs?.includes(call.seq) || event.data.message.isError!==false || !scoped(call.data.arguments,taskId))continue
      const submitted=argumentsObject(call.data.arguments)?.name
      if(meta?.captain_session_id===workerId && typeof meta.team_id==='string' && /^[a-zA-Z0-9_-]+$/.test(meta.team_id) && typeof meta.team_name==='string' && typeof submitted==='string' && submitted.trim()===meta.team_name)receipt={id:meta.team_id,name:meta.team_name}
      continue
    }
    if(event.type==='tool/ptc-dispatch-start') { nested.set(event.data.subCallId,event); continue }
    if(event.type==='tool/ptc-dispatch') {
      const start=nested.get(event.data.subCallId), root=calls.get(event.data.rootCallId)
      const parent=calls.get(event.data.parentCallId) ?? nested.get(event.data.parentCallId)
      if(!start || !root || root.data.name!=='run_code' || !parent || parent.data.name!=='run_code' || start.seq>=event.seq || start.data.rootCallId!==event.data.rootCallId || start.data.parentCallId!==event.data.parentCallId || event.data.name!=='agent_teams_create' || start.data.name!==event.data.name || event.data.isError!==false || JSON.stringify(start.data.arguments)!==JSON.stringify(event.data.arguments) || !scoped(start.data.arguments,taskId))continue
      const text=event.data.content.filter(block=>block.type==='text').map(block=>block.text).join('\n')
      const match=/^Team "([^"\r\n]+)" created \(id ([a-zA-Z0-9_-]+)\) under /m.exec(text)
      const submitted=argumentsObject(start.data.arguments)?.name
      if(match && typeof submitted==='string' && submitted.trim()===match[1])receipt={id:match[2]!,name:match[1]!}
    }
  }
  return receipt
}
