# Finish Existing Tasks Implementation Plan

> User-approved behavior: finish only the already admitted tickets, create no new tracker items or dedicated task worktrees, and retain autonomous recovery/leadership and all delivery gates. Work stays in the existing plugin checkout.

**Goal:** A persistent, per-run existing-only admission mode with explicit user reopening.

**Architecture:** Store intakeMode on Run independently from lifecycle and immutable assignment configuration. Existing-only mode prevents new task record admission and follow-up issue creation, but permits known existing setup/recovery, dependency refresh, review/repair/integration. Drain is a temporary admission hold, not the final control because it stops when active work ends. Switching draining to existing-only explicitly restores running leadership; paused/stopped states remain paused/stopped. Mode survives Pause/Resume/restart and never bypasses trial caps or ownership.

**Files:** src/captain/types.ts, controller.ts, captain.ts, src/client/CaptainPanel.tsx, tests/captain-controller.test.mjs, scripts/captain-ui.test.mjs, README.md, validation notes.

- [x] RED tests: no new admission under mode, in-flight discovery fence, existing blocked/parked recovery, persisted Pause/Resume, no follow-up creation, explicit reopening preserves trial bounds and separate sessions.
- [x] Implement mode controls and admission/follow-up guards; preserve budget and lifecycle semantics.
- [x] Add coordinator-only UI toggle/status, native control and dynamic leadership instruction.
- [x] Review, typecheck, meaningful tests, build/pack/artifact validation (302 regressions).
- [x] Safely deploy preserving existing records and set this run existing-only; update the existing heartbeat to respect the latest user instruction.
- [ ] Audit interrupted OCR holds using existing original diagnostic evidence; require actual owned quiescence before a fresh review, preserve incomplete old evidence and all final gates. No timer-only messages or invented old completion.
