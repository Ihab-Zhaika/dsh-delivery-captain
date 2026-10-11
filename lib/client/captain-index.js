import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { CAPTAIN_OPEN_EVENT, CaptainSurface } from "./CaptainPanel.js";
import css from './CaptainPanel.module.css';
export const inject = ['slots', 'sessions', 'layout'];
export function apply(ctx) {
    const Entry = ({ sessionId }) => _jsxs("button", { type: "button", className: css.entry, title: "Configure and monitor autonomous ticket delivery", onClick: () => {
            const detail = { sessionId, workspace: ctx.sessions.list.getSnapshot().byId[sessionId]?.cwd };
            window.dispatchEvent(new CustomEvent(CAPTAIN_OPEN_EVENT, { detail }));
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
    const Surface = () => _jsx(CaptainSurface, { openSession: openSession });
    ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
        name: 'conversation.session.header.actions', id: 'darkingdoom-entry', order: 55,
    }, Entry));
    ctx.slots.inject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay', id: 'darkingdoom-panel', order: 90, label: 'DarKingDoom Plugin',
    }, Surface));
}
