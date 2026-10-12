# DarKingDoom Plugin for DeepSeek Harness

An explicitly activated, continuous GitHub / Azure DevOps delivery orchestrator. Each ticket gets a Git worktree registered as a **native DSH workspace**, with its dedicated ordinary root session underneath. Workers use the **original installed AgentTeams** with advance approval. Delivery proceeds through implementation, tests, OpenCodeReview, repair, PR checks, merge and closure.

Forked from [NanmiCoder/dsh-agent-teams](https://github.com/NanmiCoder/dsh-agent-teams), retaining its history and MIT attribution. Original source remains for provenance and read-only helpers; its plugin entry is not mounted by this package. See [upstream README](README.upstream.md).

## Install

Development target: **DSH 0.2.0-rc.2**, **original AgentTeams 0.1.23**, **OCR >=1.12.13**, Node **22.19+ or 24+**. OCR must emit the `ocr.run-manifest/v1` coverage contract; incompatible reports fail closed. This fork has not been published to npm.

```powershell
git clone https://github.com/Ihab-Zhaika/dsh-delivery-captain.git
cd dsh-delivery-captain
git switch feat/delivery-captain
pnpm install --frozen-lockfile
pnpm build
pnpm verify

# Use the dsh executable belonging to the Web profile you actually run.
dsh plugin --profile web add --save-exact @nanmicoder/dsh-agent-teams@0.1.23
dsh plugin --profile web add C:/absolute/path/to/dsh-delivery-captain
```

Restart that DSH profile and refresh the browser. This fork mounts only the distinct `darkingdoom` row and `darkingdoom_*` tools; it never replaces the original `agent-teams` row.

Configure integrations in the same profile:

```powershell
dsh plugin --profile web add @vectorize-io/hindsight-coding-agents
dsh plugin --profile web add @wxg-prc-cpg/browser-skill-dsh-plugin
```

Hindsight uses your configured memory endpoint and shares repository memory across linked worktrees. BrowserSkill also needs its `bsk` CLI and Chrome/Edge extension. Both integrations are optional and can be required in run configuration once connected.

Configure GitHub CLI authentication, or Azure CLI plus its `azure-devops` extension and authentication, outside the run. Install OCR and configure its model credentials. Repository policies must permit the intended automated merges; required reviews and checks are never bypassed.

## Start once

Open an ordinary DSH session in your repository and choose **DarKingDoom Plugin** from the right sidebar's **Start** menu or the chat header. It opens as a native sidebar tab beside the chat, with **Configuration** and **Monitor** views. You can type in chat while the tab stays visible. Draft settings survive switching tabs, collapsing the sidebar and visiting another session; closing the tab discards unsaved settings but does not stop a running controller.

The panel reads the session's repository on the host and automatically fills its matching remote, provider identity, remote default branch, delivery milestones and verification commands. Repository identity fields are read-only; a submitted configuration cannot redirect this session to another repository. GitHub/Azure switching discovers the matching remote and exact provider milestone names or iteration paths.

Milestone order comes from `.darkingdoom.json` or `docs/delivery/{github,azure-devops}/plan.json` when available. Otherwise the provider catalog supplies numeric name order, shown in the panel for adjustment. Azure iteration names must resolve uniquely to full paths. Verification uses `.darkingdoom.json` settings first, then the complete `scripts/ci-local.ps1` gate, then solution/package scripts. Discovery only reads metadata; it never executes repository scripts. Missing defaults and authentication failures are visible and require valid configuration before Start.

Adjust parallel tickets, team size, execution limits, optional source filters, milestone scope and verification commands as needed. To declare defaults in another repository, commit `.darkingdoom.json` containing `milestones` (ordered exact names) and `verifyCommands` (host commands, one per array entry).

For a bounded trial, set **Ticket limit** to **1** under **Execution limits & verification**, and **Parallel tickets** to **1**. The limit counts admitted attempts, including blocked setup; it is retained through recovery and Resume. The run stops after its admitted tickets reach a terminal state (merged tickets must also be closed). **0** keeps consuming eligible tickets continuously. Parallelism alone does not limit the total tickets a run can consume.

**Start DarKingDoom Plugin** grants advance authority for full filesystem/shell/network access, original AgentTeams automatic approval, pushes, PR creation, gated merges, follow-ups and closure. Installing the plugin, opening its panel or reading ticket content never activates an ordinary session. There is no model-callable activation tool.

Human command alternative: `/darkingdoom start` discovers the current repository defaults. Optional JSON changes run preferences: `/darkingdoom start {"parallelism":1,"maxTickets":1}` for a one-ticket trial. Controls: `/darkingdoom status`, `pause`, `resume`, `drain`, `stop`.

```json
{
  "provider": "github",
  "milestones": ["Foundation", "Core", "Release"],
  "parallelism": 2,
  "maxTeamMembers": 3,
  "pollSeconds": 30,
  "maxRepairRounds": 3,
  "maxTaskMinutes": 120,
  "verifyCommands": ["pnpm typecheck", "pnpm test"],
  "workerPreset": "standard",
  "requireMemory": true,
  "requireBrowser": false
}
```

## Scheduling and autonomy

Continuously dispatch ready work from the **earliest unfinished configured milestone**. Code predecessors need confirmed merged delivery and closure. GitHub decision tickets explicitly labelled `kind:decision` may instead satisfy dependencies when closed with reason `completed`; this never claims a code merge. Related links are not dependencies. Cycles, missing references, later-milestone prerequisites, foreign claims and unavailable dependency APIs remain visible blockers. Query filters do not erase unfinished tickets from milestone accounting; avoid permanently excluding required work from the current milestone.

GitHub uses native blocked-by relationships supplemented by explicit `Depends on #123`, `Blocked by`, or `Predecessors` text, including bold delivery-template headings. Azure `AB#123` and foreign repository references are not interpreted as local GitHub IDs. Closed code delivery uses closing PR references, not arbitrary mentions. Azure uses predecessor relations and linked completed target-branch PRs. Cross-repository prerequisites are inspected but never executed outside the configured repository. Failed/cancelled work is never silently redispatched as a new ticket.

For a selected-ticket trial, command JSON may supply `ticketIds:["448","371"]` with `maxTickets:2` and `parallelism:2`. Other tickets remain in milestone and dependency accounting but cannot be admitted. `verifyCommandsByTicket` can supply nonempty command arrays for individual ticket IDs, while `verifyCommands` remains the default for every other task. This supports a documentation-only gate alongside a full application CI gate without applying the documentation override to application changes.

Each ordinary root worker leads an original AgentTeams team with `approval="automatic"`. Full-access policy is written through DSH's permission service and inherited by original descendants. Workers ask durable questions; the captain answers and wakes them. Recovery is bounded. Irresolvable work stays blocked while other eligible work continues; later milestones stay locked.

The full assignment is delivered once, with formatted JSON metadata and the ticket's actual multiline Markdown. Recovery sends a short checkpoint instead of replaying the ticket. Waiting for members or a pending answer does not restart the parent. Blocked reports retain the current team; unchanged blockers are not retried by a timer. Accepted notices, answers and identical guidance are deduplicated through persisted state and native prompt identities. One unexplained-idle checkpoint is allowed before the main session receives a diagnostic blocker.

The activated main session must use original AgentTeams for read-only technical diagnosis. Guiding a blocked worker requires genuine main-session creation receipts and completed delegated reports. `darkingdoom_answer` and `darkingdoom_message` require `action:"resume"` for a concrete actionable change, or `action:"wait"` for an unchanged hold. A wait decision for a parked worker is recorded without waking it; it also consumes any pending resume. `darkingdoom_status` includes the loaded runtime hash/build stamp and read-only live/archived team evidence. Archived history does not prove who initiated an old archive.

The sidebar shows a workspace such as **TrucX · #371** for each task worktree and a ticket-labelled root session within it. New sessions created with that workspace's **+** action stay in the same worktree for scoped continuation. A separately admitted follow-up ticket receives its own worktree/workspace. Recovery adopts the original session and workspace identities; completed task histories remain grouped. Removed historical worktrees produce a task-level grouping warning instead of preventing plugin startup. Registering or opening a workspace never starts a new delivery run.

Independent follow-ups are linked to their source, assigned a configured milestone and enter the same eligibility rules. They cannot legitimately replace current acceptance requirements. AgentTeams and the worker contract enforce scope; full-access agents are not OS-isolated from one another.

## Review and merge

The controller drains the worker team, requires original-team delivery evidence, checks a clean committed worktree, fetches the target, executes verification commands and runs OCR against immutable base/head commits. Creation evidence comes from successful native tool call/result or PTC dispatch receipts in that worker's own session, bound to its task marker, automatic approval and durable team identity; inherited calls and quoted text cannot satisfy it. Completed delegated work remains mandatory. OCR must cover every changed path with no failed/waived coverage. Critical, high and medium findings require repair; low findings remain recorded. Incomplete or unsupported reports never pass.

Passing review is reused while waiting for CI only if worktree, head and target remain unchanged. Remote checks and merge policies must pass. Accepted merge requests are reconciled until exact-head merged delivery is confirmed. Closure follows; closure failures are retried without reimplementation. GitHub currently uses normal merge commits; repositories disabling that method remain blocked.

## Controls and recovery

- **Pause:** hold new intake; existing work continues.
- **Resume:** continue a paused/draining/stopped saved run; cancelled workers requeue automatically within capacity using their existing sessions and worktrees. Merged tasks never restart.
- **Drain:** finish runnable work, then stop; blocked work is preserved.
- **Stop:** revoke admission, quiesce workers, archive their original teams, cancel command trees and drain selected continuable children, preserving files/state and the root session's ability to launch a recovery team on Resume.

The DSH host must stay running. Closing the dashboard does not stop automation. Cold restart restores explicitly enabled runs and rechecks prerequisites. A single-host repository lease prevents duplicate captain ownership. State: `$DSH_HOME/darkingdoom` (default `~/.dsh/darkingdoom`). Worktrees: beside the checkout under `.delivery-worktrees/`. Worktrees are retained for inspection, never automatically deleted. AgentTeams state is ignored through Git `info/exclude`.

Normal host shutdown quiesces execution and preserves original team graphs for recovery. Explicit Stop and controller review still use the original archive operation. Waiting or reporting a blocker does not archive a team.

## Statistics

Task details show session, ticket, milestone, PR, status, total delivery elapsed time, review rounds, blockers, questions and phase timeline. Testing and OCR are controller-timed; implementation phases are worker-reported. Phase intervals partition elapsed time, including waits. Summed task time can exceed run time because tasks overlap. Active agent effort and token/cost telemetry are explicitly unmeasured. Historical review reports can be downloaded.

## Development and verification

```powershell
pnpm typecheck
pnpm build
pnpm verify
pnpm pack --pack-destination artifacts
```

Tests cover scheduling, durable claims, stop/restart races, provider contracts, exact-head gates, real temporary Git worktrees, OCR parsing, process cancellation, permissions, approvals and UI rendering. See [validation evidence](docs/darkingdoom-validation.md). Live authenticated provider delivery with a model remains a separate integration trial; local tests are not evidence of production delivery.

Built artifacts support local/Git installation. Keep `lib/` and its source stamp synchronized. `verify:upstream` retains original branding/version-specific checks; it is not the fork's release gate.

## Runtime protocol and KV cache

The captain prompt section is empty in ordinary sessions. Activated captains receive stable instructions, with changing queue state delivered through tools and durable messages. Workers get scoped assignments in independent root sessions. Tool names remain stable; phases and queues do not rewrite the global prompt. Original AgentTeams owns its descendant contexts.

## License

MIT; original attribution retained. New orchestration is maintained in this fork.
