import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { CaptainPanel } from "./CaptainPanel.js";
import css from './CaptainPanel.module.css';
export const inject = ['slots', 'sessions', 'layout', 'sidebarRight', 'sidebarRightTabs'];
export const DARKINGDOOM_TAB_KIND = 'darkingdoom';
export const DARKINGDOOM_TAB_ID = '@ihab-zhaika/dsh-darkingdoom/dashboard';
export function apply(ctx) {
    const Entry = ({ sessionId }) => _jsxs("button", { type: "button", className: css.entry, title: "Configure and monitor autonomous ticket delivery", onClick: () => {
            ctx.sidebarRight.openTab(DARKINGDOOM_TAB_KIND);
        }, children: [_jsx("span", { "aria-hidden": true, children: "\u2301" }), "DarKingDoom Plugin"] });
    const openSession = async (_parentId, childId) => {
        // Delivery workers are ordinary root sessions, not native continuable subagents.
        const workspace = ctx.get('uiWorkspace');
        const sessions = ctx.sessions;
        if (workspace)
            workspace.openSession(childId);
        else if (sessions.open)
            sessions.open(childId);
        else
            throw new Error('Harness does not expose ordinary session navigation');
        ctx.layout.selectPanel?.(null);
    };
    const Surface = ({ sessionId, useTabInfo }) => {
        const info = useTabInfo();
        return _jsx(CaptainPanel, { sessionId: sessionId, workspace: ctx.sessions.list.getSnapshot().byId[sessionId]?.cwd, openSession: openSession, onClose: () => info.tab.actions.close() }, sessionId);
    };
    ctx.effect(() => ctx.sidebarRightTabs.register({
        id: DARKINGDOOM_TAB_ID, kind: DARKINGDOOM_TAB_KIND, keepMounted: true, title: () => 'DarKingDoom Plugin',
        guide: [{ id: 'darkingdoom-entry', order: 30, title: () => 'DarKingDoom Plugin', description: () => 'Configure and monitor autonomous delivery in this repository' }],
    }));
    ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
        name: 'conversation.session.header.actions', id: 'darkingdoom-entry', order: 55,
    }, Entry));
    ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
        name: 'sidebar.right.pane.tab', key: DARKINGDOOM_TAB_ID,
    }, Surface));
}
