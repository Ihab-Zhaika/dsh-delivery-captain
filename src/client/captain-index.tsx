/** Dedicated fork browser entry. Ordinary AgentTeams keeps its own entry. */
import type { Context } from '@deepseek-ai/cordis'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { CaptainPanel } from './CaptainPanel.tsx'
import type { AgentTeamsLayoutNavigator, AgentTeamsSessionNavigator, AgentTeamsWorkspaceNavigator } from './session-navigation.ts'
import css from './CaptainPanel.module.css'

export const inject = ['slots', 'sessions', 'layout', 'sidebarRight', 'sidebarRightTabs']
export const DARKINGDOOM_TAB_KIND = 'darkingdoom'
export const DARKINGDOOM_TAB_ID = '@ihab-zhaika/dsh-darkingdoom/dashboard'

export function apply(ctx: Context): void {
  const Entry = ({ sessionId }: PropsRuntime<'conversation.session.header.actions'>) => <button type="button" className={css.entry} title="Configure and monitor autonomous ticket delivery" onClick={() => {
    ctx.sidebarRight.openTab(DARKINGDOOM_TAB_KIND)
  }}><span aria-hidden>⌁</span>DarKingDoom Plugin</button>
  const openSession = async (_parentId: string, childId: string): Promise<void> => {
    // Delivery workers are ordinary root sessions, not native continuable subagents.
    const workspace = ctx.get('uiWorkspace') as AgentTeamsWorkspaceNavigator | undefined
    const sessions = ctx.sessions as AgentTeamsSessionNavigator
    if (workspace) workspace.openSession(childId as SessionId)
    else if (sessions.open) sessions.open(childId as SessionId)
    else throw new Error('Harness does not expose ordinary session navigation')
    ;(ctx.layout as AgentTeamsLayoutNavigator).selectPanel?.(null)
  }
  const Surface = ({sessionId, useTabInfo}: PropsRuntime<'sidebar.right.pane.tab'>) => {
    const info = useTabInfo()
    return <CaptainPanel key={sessionId} sessionId={sessionId} workspace={ctx.sessions.list.getSnapshot().byId[sessionId]?.cwd} openSession={openSession} onClose={() => info.tab.actions.close()} />
  }
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: DARKINGDOOM_TAB_ID, kind: DARKINGDOOM_TAB_KIND, keepMounted: true, title: () => 'DarKingDoom Plugin',
    guide: [{id:'darkingdoom-entry',order:30,title:()=> 'DarKingDoom Plugin',description:()=> 'Configure and monitor autonomous delivery in this repository'}],
  }))
  ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
    name: 'conversation.session.header.actions', id: 'darkingdoom-entry', order: 55,
  }, Entry))
  ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab', key: DARKINGDOOM_TAB_ID,
  }, Surface))
}
