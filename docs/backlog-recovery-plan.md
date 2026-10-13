# Parked Backlog Recovery Implementation Plan

**Goal:** Detect accumulating holds automatically, stop admitting more ticket work, and use one durable recovery session per run to repair shared causes and release existing assignments.

**Approved scope:** The human requested a dedicated recovery session when more than four tickets are parked, including fixes outside individual ticket scope. This explicitly permits one recovery workspace/session despite the current frozen ticket roster. No tracker issue is required or created. The existing 48-ticket selection, original teams, final gates and human intake hold remain authoritative.

**Architecture:** A persistent backlog hold is separate from human intake mode. Default parked threshold is four. Both independent owned maintenance and intake check the threshold before new admission. One separately persisted recovery task owns an isolated remote-target worktree/native workspace and ordinary root session; it never enters ticket admission/claim counts. Repeated scans/restarts reuse its identity and original team. The session inspects existing histories, correlates shared CI/review/plugin/environment causes, repairs safely in isolated checkouts or delegates to an existing owner such as #453, and reports concrete solutions. Recovery code PRs use normal exact-head original-team/OCR/verification/provider gates without a fake closing issue. Plugin maintenance uses a separate isolated checkout of the loaded plugin version, with actual checks/review and a concrete patch/PR handoff to the coordinator/maintenance monitor; no edits in the dirty main TrucX checkout.

**Recovery rules:** A successful shared repair does not blanket-unpark the backlog. Only listed existing assignments receive a concrete recovery request, after verified idle ownership and fresh dependency proof. A merged shared fix requires the existing worker to incorporate the target commit, preserve its work, resolve conflicts and rerun exact-head review/CI. Previous failures stay in history. External device/legal/provider prerequisites remain recorded. Unknown native jobs are never treated as idle. New intake remains held while above threshold, while recovery is unsettled, or whenever the human selected existing-only. Identical observations never produce timer-only worker messages or repeated recovery sessions.

**Proactive evidence:** Show parked count/threshold, intake hold, dedicated recovery session link, latest state/error and phase timings in the monitor. Recovery receives changed backlog facts rather than repeated generic prompts. Existing idle/background-job checks continue; coordinator instructions require resolution of controller-created holds and proactive shared-cause analysis. The 30-minute maintainer inspects the same health evidence, runtime failures and loaded-build identity, fixes plugin defects and keeps the latest human intake scope.

**Validation plan:**

- [ ] RED/GREEN tests for threshold boundary, admission fence during discovery, automatic dedicated session creation without claims/count changes, persisted identity and deduplication across concurrent scans/restarts, failed startup retry, Pause/Stop cancellation and separate runs.
- [ ] Add recovery contracts/selection; reuse native worker permission/team/worktree transport with a recovery-specific prompt and coordinator-owned reporting.
- [ ] Gate recovery PR creation without fake issue closure; preserve exact-head checks and repair flow.
- [ ] Queue only affected idle assignments after validated recovery and fresh dependency proof; preserve all histories and require target-ancestor proof after a shared merge.
- [ ] Add monitor recovery evidence and meaningful UI/provider/runtime regression checks.
- [ ] Focused review, typechecks, regressions, build, package/artifact checks; commit and update draft PR.
- [ ] Safely load, verify one dedicated recovery workspace/session and frozen ticket roster, update the heartbeat, and observe actual original-team recovery activity.
