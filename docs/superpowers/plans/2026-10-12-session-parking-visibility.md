# Session ownership, parking and eligibility implementation plan

**Goal:** Apply the user's authorized session-scoped dashboard, one-hour parking, quiet guidance and dependency visibility updates.

**Architecture:** Retain one durable run per explicitly activated coordinator session. Workers receive a read-only projection containing their own task and coordinator identity. Each run has an independent scheduling lock. Park unresolved contiguous blocking after more than one hour, quiescing writers while preserving team graphs and worktrees; only concrete new evidence or explicit human resumption reopens the task. Dependency and milestone gates remain unchanged.

**Tech stack:** TypeScript controller/runtime, React native sidebar, Node test runner, DSH 0.2.0-rc.2 APIs.

- [x] Add failing controller tests for session projection, parking boundaries, preserved scope and independent run scheduling.
- [x] Implement durable parked state, contiguous blocked clock, explicit resumption and per-run scheduler locks. Preserve idempotent guidance and reviews.
- [x] Classify review infrastructure failures, retain known commit identity, and distinguish historical failures from current passing evidence.
- [x] Add classified eligibility decisions and a keyboard-accessible dependency graph with missing/cyclic predecessor details.
- [x] Render worker-only task metrics, origin navigation and history; coordinator retains run controls and parking resumption.
- [x] Run typecheck, focused tests, full plugin verification and independent review; resolve findings.
- [x] Rebuild/install via pause and graph-preserving shutdown, inspect live worker/coordinator panels, update documentation and draft PR.

Parking does not close tickets, waive gates, or authorize work outside the configured ticket cap. Wall time includes parked waiting; task execution budget excludes parked intervals. Existing historical review records remain immutable.
