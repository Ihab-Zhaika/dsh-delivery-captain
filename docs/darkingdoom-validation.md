# DarKingDoom Plugin validation — 2026-10-12

## Verified locally

- Windows, Node 24.15.0, DSH 0.2.0-rc.2, original AgentTeams 0.1.23, OCR installed v1.12.13.
- `pnpm typecheck`: host and browser TypeScript passed.
- `pnpm build`: host/browser artifacts built. The inherited DSH browser-loader contract requires CJS; tsdown's general ESM recommendation is expected.
- `pnpm verify`: 98 tests passed, zero failures. Source/build artifact stamp matched.
- Repository discovery: real temporary repositories, both remotes, remote default branch, repository plan order, full Azure iteration paths, safe metadata reads, missing authentication/defaults, and refusal to redirect a session to another repository.
- Temporary real Git repositories: fetched target branch, isolated worktree/branch, idempotent adoption, dirty-worktree rejection and branch/target drift.
- Provider contract fixtures: GitHub dependency closure and closing PRs; Azure native predecessors, custom workflow completion categories, acceptance fields, pagination, exact-head merge and remote policy checks.
- Controller: explicit activation, milestone/dependency gates, failed claims, duplicate ticks, concurrent starts, stop-during-launch, capacity reservation, review repair, CI review caching, lost merge acknowledgement, closure failure, durable questions and cold recovery.
- Runtime: genuine root-session APIs, inherited next model selection, original-team scope evidence, advance approval guards, descendants/command cancellation, BrowserSkill lazy discovery and complete OCR coverage validation.
- UI: initial activation semantics, stopped-run resume, phase accounting, report rendering/download and production CSS compilation.
- Native sidebar: a distinct registered tab and Start-menu card, no overlay or modal/focus trap, session-scoped body, retention through hiding, Configuration/Monitor views, and ordinary worker navigation. The live TrucX chat remained visible and focusable with the plugin open. Local screenshots: `artifacts/darkingdoom-sidebar-configuration.png` and `artifacts/darkingdoom-sidebar-monitor.png`.
- Authenticated TrucX discovery: GitHub default `Ihab-Zhaika/TrucX`, `github/main`, all ten M0–M9 milestones and complete local CI; Azure `origin/main`, organization/project/repository and all ten native iteration paths. No project scripts were executed during discovery.
- Independent review of repository discovery caught the pnpm subdirectory flag, provider-specific plan precedence and unchecked milestone overrides. These were fixed with regression coverage; submitted milestones must exist in the selected provider catalog.

## Real host and browser checks

Two isolated DSH_HOME profiles were created under the ignored `.captain-smoke/` directory. Both original AgentTeams and this fork were installed side by side. No customer backlog run was started.

The real Web UI rendered the DarKingDoom Plugin session-header action and dashboard. Saved-state loading completed; GitHub/Azure switching exposed the expected fields. The dashboard remained **Not Started** and automation disabled. No browser console errors were observed. Preview screenshot: `artifacts/delivery-captain-dashboard.png` (local artifact).

The host contract probe created an ordinary root worker without a model turn. Its session retained the original `agent_teams_create`, `agent_teams_add_member`, `agent_teams_create_task`, and `agent_teams_delete` tools. Durable events confirmed `permission/preset=danger-full-access`, `sandbox/mode=danger-full-access`, and `approval/policy=never`; the worker remained idle. Reusable probe: `scripts/captain-host-probe.mjs`, mounted only in an isolated profile using a patch and `CAPTAIN_PROBE_WORKSPACE` / `CAPTAIN_PROBE_OUTPUT`.

The isolated Web profile intentionally had no model credentials. A UI-only chat produced the expected missing-credential message; no successful live model delivery is claimed.

## Naming

Offline naming compatibility passed. Short command/tool names produce optional publisher-prefix recommendations. The community registry lookup returned no reviewed matches for DSH 0.2.0-rc.2. Index SHA-256: `0a9ba9bd9b4e0d2ab8136e750103b55ee23487e3e954c643aea1b210c4045a34`, source `https://raw.githubusercontent.com/oh-my-dsh/dsh-plugin-registry/main/registry/index.json`. This is not a namespace reservation.

## Integration boundaries for the user's trial

An additional OpenCodeReview source review was attempted with a five-minute per-group budget and concurrency four. It completed six files, but sixteen files failed with `caller deadline exceeded`; the remaining run was cancelled. This was an **incomplete review**, not a passing gate. Independent agent reviews found concurrency, shutdown, claim recovery and session-navigation defects; those were fixed with regression tests. The implementation's OCR gate correctly treats comparable incomplete reports as failures.

A real ticket → model/team implementation → OCR → CI → merge trial against authenticated GitHub or Azure DevOps has not been run. BrowserSkill's real extension/CLI and Hindsight's configured memory server were not exercised in the isolated profile. Their capability wiring is tested; live service behavior remains an integration boundary.

Task phase and elapsed metrics are implemented. Aggregate active-agent effort, token usage and cost are intentionally shown as unmeasured. Worktrees are retained, and external repository policies may block fully unattended merging. GitHub supports github.com and normal merge commits in this version. Single-host locking is not a distributed multi-machine claim service.
