/** Dedicated fork browser entry. Ordinary AgentTeams keeps its own entry. */
import type { Context } from '@deepseek-ai/cordis'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { CAPTAIN_OPEN_EVENT, CaptainSurface, type CaptainOpenDetail } from './CaptainPanel.tsx'
import type { AgentTeamsLayoutNavigator, AgentTeamsSessionNavigator, AgentTeamsWorkspaceNavigator } from './session-navigation.ts'
import css from './CaptainPanel.module.css'

export const inject = ['slots', 'sessions', 'layout']

export function apply(ctx: Context): void {
  const Entry = ({ sessionId }: PropsRuntime<'conversation.session.header.actions'>) => <button type="button" className={css.entry} title="Configure and monitor autonomous ticket delivery" onClick={() => {
    const detail: CaptainOpenDetail = { sessionId, workspace: ctx.sessions.list.getSnapshot().byId[sessionId]?.cwd }
    window.dispatchEvent(new CustomEvent(CAPTAIN_OPEN_EVENT, { detail }))
  }}><span aria-hidden>⌁</span>Delivery Captain</button>
  const openSession = async (_parentId: string, childId: string): Promise<void> => {
    // Delivery workers are ordinary root sessions, not native continuable subagents.
    const workspace = ctx.get('uiWorkspace') as AgentTeamsWorkspaceNavigator | undefined
    const sessions = ctx.sessions as AgentTeamsSessionNavigator
    if (workspace) workspace.openSession(childId as SessionId)
    else if (sessions.open) sessions.open(childId as SessionId)
    else throw new Error('Harness does not expose ordinary session navigation')
    ;(ctx.layout as AgentTeamsLayoutNavigator).selectPanel?.(null)
  }
  const Surface = () => <CaptainSurface openSession={openSession} />
  ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
    name: 'conversation.session.header.actions', id: 'delivery-captain-entry', order: 55,
  }, Entry))
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id: 'delivery-captain-panel', order: 90, label: 'Delivery Captain',
  }, Surface))
}
