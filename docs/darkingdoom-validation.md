# DarKingDoom Plugin validation — 2026-10-12

## Verified locally

- Windows, Node 24.15.0, DSH 0.2.0-rc.2, original AgentTeams 0.1.23, OCR installed v1.12.13.
- `pnpm typecheck`: host and browser TypeScript passed.
- `pnpm build`: host/browser artifacts built. The inherited DSH browser-loader contract requires CJS; tsdown's general ESM recommendation is expected.
- `pnpm verify`: 115 tests passed, zero failures. Source/build artifact stamp matched.
- Repository discovery: real temporary repositories, both remotes, remote default branch, repository plan order, full Azure iteration paths, safe metadata reads, missing authentication/defaults, and refusal to redirect a session to another repository.
- Temporary real Git repositories: fetched target branch, isolated worktree/branch, idempotent adoption, dirty-worktree rejection and branch/target drift.
- Provider contract fixtures: GitHub dependency closure and closing PRs; Azure native predecessors, custom workflow completion categories, acceptance fields, pagination, exact-head merge and remote policy checks.
- Controller: explicit activation, milestone/dependency gates, failed claims, duplicate ticks, concurrent starts, stop-during-launch, capacity reservation, review repair, CI review caching, lost merge acknowledgement, closure failure, durable questions and cold recovery.
- Runtime: genuine root-session APIs, inherited next model selection, native tool/PTC original-team creation receipts, advance approval guards, descendants/command cancellation, late team publication during stop, recovery without permanently closing parent admission, BrowserSkill lazy discovery and complete OCR coverage validation.
- Bounded trials: lifetime ticket caps count failed claims and survive Resume; explicit ticket selection preserves milestone accounting; per-ticket verification overrides cannot leak to other tickets; closed completed decision tickets remain distinct from merged code delivery. Cold stop/resume automatically wakes saved workers within capacity, preserves session identities, and never restarts merged tasks. Explicit guidance consumes pending recovery; answers do not append boilerplate contradicting a hold.
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

A live authenticated GitHub trial runs against TrucX. The owner expanded the original single-ticket trial to tickets #448 and #371 with parallelism two and a lifetime admission limit of two. #448 is a documentation runbook with its own verification override; #371 retains complete repository CI and staging acceptance. Real original AgentTeams delegates implemented and repaired the #448 document; configured OCR produced an initial skipped report, a covered report with two medium findings, and covered repaired-head reports with zero comments. Each result remains evidence only for its exact commit.

**Verified delivery:** the controller's own fresh OCR covered the one changed file with zero comments (5m35s, 175,316 total tokens). It reviewed head `1128f3dffee7c77c05d40d96d8968a92f5d1aacf` against base `c8886ce7a8e9b60b9c1fc3ca2b3859fecf5ca3b9`. [PR #449](https://github.com/Ihab-Zhaika/TrucX/pull/449) merged that exact head into main as `686b928685de11be338984d2d37aef7de598288e` at 2026-10-11T23:38:37Z. [Issue #448](https://github.com/Ihab-Zhaika/TrucX/issues/448) closed as completed at 23:38:38Z; controller closure persisted at 23:38:40Z. GitHub reported no remote status checks on this documentation PR; this is not a full application CI pass. Total task elapsed was about 97 minutes, including operator pauses, debugging and reviews. No token-cost estimate is inferred from those counts.

#371 remains in implementation/testing. Its staging budget was increased to 480 minutes while retaining the same task/session/worktree, two-ticket cap and all required acceptance. Its later outcomes are not claimed here. The trial also exposed parked cancelled workers after Resume and a contradictory generic answer footer; both were reproduced and fixed with five regressions. Independent review identified that queued recovery must also respect Pause/Drain; that case was reproduced and repaired before installation.

The first controller gate exposed that DSH 0.2.0-rc.2 omits the optional `agent-teams/team-created` event. Creation proof now uses supported session inspection of successful native tool call/result or PTC dispatch receipts and matching durable team identity, rather than synthesizing events. Recovery also exposed that draining all continuable descendants permanently closes the parent's admission; stop now quiesces the root before team discovery/archive and drains selected children through the public SDK. Regressions and an independent source review cover these fixes.

TrucX's pinned host SDK 10.0.112 was provisioned privately from Microsoft's official ZIP after SHA-512 verification, without changing `global.json` or machine SDKs. Docker staging still requires its own genuine build, integration, image, browser and physical-device evidence. Android/iPhone installs and a second physical LAN device are unavailable to this automation; they cannot be relabelled as browser-emulation passes or silently deferred acceptance. BrowserSkill's Edge connection was skipped at the owner's request. Hindsight's live memory service has not been exercised. Their capability wiring is tested; live service behavior remains an integration boundary.

Task phase and elapsed metrics are implemented. Aggregate active-agent effort, token usage and cost are intentionally shown as unmeasured. Worktrees are retained, and external repository policies may block fully unattended merging. GitHub supports github.com and normal merge commits in this version. Single-host locking is not a distributed multi-machine claim service.
