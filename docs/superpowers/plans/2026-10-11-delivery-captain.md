# Delivery Captain Implementation Plan

> Use focused parallel agents for independent provider, runtime and UI modules, then integrate and review centrally. The user has approved implementation and automatic execution; no further design approval is needed.

**Goal:** A locally installable DSH Web plugin for autonomous, continuous ticket delivery.

**Architecture:** Keep upstream source/history; publish a distinct captain entry point. A durable single-writer controller owns run scheduling and merge gates. CLI provider adapters, ordinary root DSH worker sessions and a native Web dashboard communicate through typed contracts.

**Tech stack:** TypeScript, Node 22+, Cordis/DSH 0.2.0-rc.2, React, Git, gh, Azure DevOps CLI, OpenCodeReview.

- [x] Define `src/captain/types.ts` with provider/runtime/controller contracts; save approved requirements.
- [x] Implement `src/captain/providers.ts` and tests: GitHub pagination/native predecessor links, Azure WIQL/relations, strict normalization, PR checks/merge/close/follow-up, argument-array CLI execution. Run `node --test tests/captain-providers.test.mjs` after build.
- [x] Implement `src/captain/runtime.ts`, `worktrees.ts`, `review.ts` and tests: real root sessions, full-access policy, original AgentTeams automatic approval, durable session identity, worktree creation/reuse, OCR JSON and exact-head verification. Inspect exact installed DSH contracts rather than inventing APIs.
- [x] Implement `src/captain/scheduler.ts`, `store.ts`, `controller.ts` and tests: milestone order, dependency cycles/missing/merged gates, durable ownership and atomic writes, bounded concurrency, retries, stop/drain/restart, question delivery, follow-up and verified merge. Test negative paths before implementing them.
- [x] Implement native React dashboard in `src/client/CaptainPanel.tsx` and `captain-index.tsx`: explicit activation, configuration, live queue, controls, questions and accurate elapsed/phase metrics; isolated authenticated API routes.
- [x] Wire `src/captain.ts`, distinct package and bundle identities, owner-scoped tools and prompts, authenticated UI routes. Test inert ordinary sessions and package coexistence.
- [x] Build, typecheck, run focused tests, review source, fix findings, pack the artifact and load an isolated DSH profile without running a live ticket. Document commands and uncovered external boundaries. Commit and push implementation to the requested fork.

Acceptance cases: current milestone blocks later ones; only merged predecessors unlock work; duplicate ticks do not dispatch twice; restart adopts existing sessions/worktrees/PRs; worker questions reach captain; stale/review-failed heads cannot merge; stop prevents late dispatch; task phase durations partition elapsed time; generated follow-ups cannot bypass scope; idle continuous runs accept newly eligible tickets.
