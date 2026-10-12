# Coordinator native loop implementation plan

**Goal:** Starting an explicitly activated DarKingDoom run also starts DSH's native same-session goal loop in its main coordinating chat.

**Architecture:** A small goal-service adapter owns a run-scoped native goal. Start creates/arms it; Pause pauses, Resume rearms, Stop and completed trials complete it; shutdown disarms without silently restarting on restore. An unrelated existing goal must never be overwritten. Model-side waiting disarms continuation without repeated worker prompts, and new durable coordinator events wake that owned waiting goal. Native limits and abnormal stops remain visible, never silently reset.

- [x] Test native creation, ownership, idempotency, waiting/wake, lifecycle and stopped-run behavior.
- [x] Add adapter/runtime hooks and coordinator-only waiting tool.
- [x] Wire Start/control/automatic completion and show actual loop status/rounds with explicit existing-run activation.
- [x] Typecheck, build, verify, independent review, reload preserving task graphs, and activate the existing main session through the authorized control path.
- [x] Verify native goal projection and sidebar loop state, update docs/package/draft PR.
