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

Runs belong to the session that explicitly starts them. Different repositories can have independent coordinators, intake limits and controls; one repository's long review cannot stall another coordinator. A worker, its native team descendants, or another chat opened in its task worktree shows a read-only **Initiated by coordination session** link, its own ticket history, total elapsed time and phase breakdown. Run controls stay in the coordinating chat. Another ordinary chat in the main repository stays inactive. Repository leases prevent competing coordinators from claiming the same repository concurrently.

**Start also enables DSH's native same-session goal loop in the main coordinator.** It leads the plugin and original diagnostic subagents while delivery proceeds. The panel shows actual activation and admitted rounds against the native goal cap (deployment default 256). Pause pauses that goal; Resume rearms it; Stop and finished bounded trials complete the run-scoped goal. Another unfinished goal in the same chat is never overwritten. An existing run can use **Start coordinator loop** or `/darkingdoom loop` without creating another run or worker.

When only waiting remains, the coordinator calls `darkingdoom_wait`: native continuation is disarmed quietly while queue discovery and workers continue. New delivery notices/questions/dispatch events rearm only this owned waiting goal. Ordinary/native team messages still reach the main chat. No repeated timer prompts to waiting or parked workers are introduced. Native round exhaustion, blocked goals and abnormal provider/cancellation stops remain visible and require explicit resumption; they are never silently reset. Host shutdown disarms the goal; use Resume to rearm a restored run.

Milestone order comes from `.darkingdoom.json` or `docs/delivery/{github,azure-devops}/plan.json` when available. Otherwise the provider catalog supplies numeric name order, shown in the panel for adjustment. Azure iteration names must resolve uniquely to full paths. Verification uses `.darkingdoom.json` settings first, then the complete `scripts/ci-local.ps1` gate, then solution/package scripts. Discovery only reads metadata; it never executes repository scripts. Missing defaults and authentication failures are visible and require valid configuration before Start.

Adjust parallel tickets, team size, execution limits, optional source filters, milestone scope and verification commands as needed. To declare defaults in another repository, commit `.darkingdoom.json` containing `milestones` (ordered exact names) and `verifyCommands` (host commands, one per array entry).

Saved team sizes apply to future assignments. An explicit human task resumption can also raise that existing task's member cap up to the saved run limit; its verification, acceptance and repair limits stay bound to the original assignment. Explicit human task Resume, or run Resume of selected cancelled tasks, starts a fresh bounded execution window with that assignment's original duration. Previous elapsed time, phase history and failures remain visible; automatic model resumption cannot renew the budget.

For a human Resume or Retry, a short reason such as **solved** is sufficient. It authorizes one normal retry of the blocked step, superseding the prior waiting decision for that retry. The worker uses its existing team, checks actual results and reports a concrete blocker if it still fails; it does not ask for proof before attempting the retry. Retry never declares a verification or merge gate passed, weakens security protections or fabricates device evidence. Idle blocked/waiting workers can be retried without waiting for parking.

An existing prepared worker receives its retry directly through native session transport, independently of tracker discovery. Its registered worktree, branch and base are validated locally without another ticket claim or remote fetch. Capacity, Stop/Pause and original budget limits remain enforced. Initial claims, new worktrees, uncertain reviewed-PR reconciliation and final delivery still require their remote checks; a discovery outage prevents new admissions.

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

Continuously fill available slots with tickets whose dependencies are satisfied across **all configured milestones**. Milestone order is priority, not a completion barrier: prefer earlier milestones, then ticket priority and age. Independent M1 work can run while M0 work is running, blocked or parked. Code predecessors need confirmed merged delivery and closure. GitHub decision tickets explicitly labelled `kind:decision` may instead satisfy dependencies when closed with reason `completed`; this never claims a code merge. Related links are not dependencies. Cycles, missing references, unsatisfied predecessors, foreign claims and unavailable dependency APIs remain visible blockers. A prerequisite in a later milestone is scheduled normally when its own dependencies are met. Query filters do not erase unfinished tickets from milestone accounting; avoid permanently excluding required work from the current milestone.

GitHub uses native blocked-by relationships supplemented by explicit `Depends on #123`, `Blocked by`, or `Predecessors` text, including bold delivery-template headings. Azure `AB#123` and foreign repository references are not interpreted as local GitHub IDs. Closed code delivery uses closing PR references, not arbitrary mentions. Azure uses predecessor relations and linked completed target-branch PRs. Cross-repository prerequisites are inspected but never executed outside the configured repository. Failed/cancelled work is never silently redispatched as a new ticket.

For a selected-ticket trial, command JSON may supply `ticketIds:["448","371"]` with `maxTickets:2` and `parallelism:2`. Other tickets remain in milestone and dependency accounting but cannot be admitted. `verifyCommandsByTicket` can supply nonempty command arrays for individual ticket IDs, while `verifyCommands` remains the default for every other task. This supports a documentation-only gate alongside a full application CI gate without applying the documentation override to application changes.

Each ordinary root worker leads an original AgentTeams team with `approval="automatic"`. Full-access policy is written through DSH's permission service and inherited by original descendants. Workers ask durable questions; the captain answers and wakes them. Recovery is bounded. Irresolvable work stays blocked while other eligible work continues across the selected milestones.

After **more than one hour of contiguous unresolved blocking**, the controller **parks** the task. Repeated blocked reports do not reset that clock. Parking quiesces execution and preserves the worktree, original team graph and immutable review history. It frees capacity only after quiescence succeeds; failures remain visible and reserve the slot. Other eligible tickets across selected milestones can proceed within the existing admission cap. Parked predecessors still block their dependents. Wall time includes parked waiting, shown separately in the timeline; parked intervals do not consume the task execution budget.

Run-level Pause/Resume and cold recovery never automatically unpark tasks. Select a parked task in the coordinator panel, describe the changed prerequisite or explicit human resumption, and choose **Resume this parked task**. A coordinator with genuine completed original diagnostic reports can use `darkingdoom_resume_task` for a concrete new solution. Ordinary guidance and answers cannot wake parked workers. The scheduler reuses the same session/worktree when capacity is available. Eligibility displays prerequisite arrows and selectable ticket nodes with explicit delivered, decision-complete, parked, excluded, dependency and milestone reasons.

The full assignment is delivered once, with formatted JSON metadata and the ticket's actual multiline Markdown. Recovery sends a short checkpoint instead of replaying the ticket. Waiting for members or a pending answer does not restart the parent. Blocked reports retain the current team; unchanged blockers are not retried by a timer. Accepted notices, answers and identical guidance are deduplicated through persisted state and native prompt identities. One unexplained-idle checkpoint is allowed before the main session receives a diagnostic blocker.

The activated main session must use original AgentTeams for read-only technical diagnosis. Guiding a blocked worker requires genuine main-session creation receipts and completed delegated reports. `darkingdoom_answer` and `darkingdoom_message` require `action:"resume"` for a concrete actionable change, or `action:"wait"` for an unchanged hold. A wait decision for a parked worker is recorded without waking it; it also consumes any pending resume. `darkingdoom_status` includes the loaded runtime hash/build stamp and read-only live/archived team evidence. Archived history does not prove who initiated an old archive.

The sidebar shows a workspace such as **TrucX · #371** for each task worktree and a ticket-labelled root session within it. New sessions created with that workspace's **+** action stay in the same worktree for scoped continuation. A separately admitted follow-up ticket receives its own worktree/workspace. Recovery adopts the original session and workspace identities; completed task histories remain grouped. Removed historical worktrees produce a task-level grouping warning instead of preventing plugin startup. Registering or opening a workspace never starts a new delivery run.

Independent follow-ups are linked to their source, assigned a configured milestone and enter the same eligibility rules. They cannot legitimately replace current acceptance requirements. AgentTeams and the worker contract enforce scope; full-access agents are not OS-isolated from one another.

## Review and merge

The controller drains the worker team, requires original-team delivery evidence, checks a clean committed worktree, fetches the target, executes verification commands and runs OCR against immutable base/head commits. Creation evidence comes from successful native tool call/result or PTC dispatch receipts in that worker's own session, bound to its task marker, automatic approval and durable team identity; inherited calls and quoted text cannot satisfy it. Completed delegated work remains mandatory. OCR must cover every changed path with no failed/waived coverage. Critical, high and medium findings require repair; low findings remain recorded. Incomplete or unsupported reports never pass.

Passing review is reused while waiting for CI only if worktree, head and target remain unchanged. Remote checks and merge policies must pass. Accepted merge requests are reconciled until exact-head merged delivery is confirmed. Closure follows; closure failures are retried without reimplementation. GitHub currently uses normal merge commits; repositories disabling that method remain blocked.

Review records distinguish unavailable original team evidence, verification infrastructure failures and actual OCR findings. Failed gates carry their concrete error into bounded repair; incomplete coverage, timeouts and missing receipts never pass. Earlier failures remain labelled **Historical failure**, alongside the latest recorded result. A commit unavailable at an early evidence failure stays unavailable; it is not filled in retroactively. Previously merged exact reviewed PRs are reconciled even for parked tasks.

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

## Edit a stopped run

After Stop finishes, open **Configuration**, edit operational settings and choose **Save configuration**. Save keeps the run stopped; use **Monitor → Resume** separately when ready. Existing task sessions, worktrees, review history and original assignment gates remain intact. Team size, preset, verification and execution/repair limits are captured at assignment and do not retroactively weaken old tickets. Revised settings apply to future admissions; the global parallel limit applies to the resumed scheduler.

**Ticket IDs** is now visible. A trial may have both an admission cap and a ticket allowlist: set Ticket limit to 0 and clear Ticket IDs for continuous eligible intake. This does not bypass milestones or dependencies, reset past admission counts, or automatically unpark tasks. Cancelled tasks outside an updated explicit ticket/milestone selection remain cancelled. Source/repository/remote/target identity is fixed for the run; use another coordinator chat to switch tracker or repository identity.

Configuration remains locked while running, paused or draining and in worker chats. Save verifies native execution is quiescent and rejects concurrent lifecycle changes. Clean form values update from the saved configuration; dirty drafts survive polling. Save is required before resuming with unsaved form changes. Editing stopped settings does not extend the recorded stopped wall time.
