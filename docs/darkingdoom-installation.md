# DarKingDoom Plugin setup

The public package is `@ihab-zhaika/dsh-darkingdoom`; the Loader ID and slash command are `darkingdoom`, tools use `darkingdoom_*`, HTTP routes use `/api/darkingdoom/`, and UI slots/events use `darkingdoom-*`. The UI name is **DarKingDoom Plugin**. The original `agent-teams` row, `/agent-teams` command and `agent_teams_*` tools are owned by separately installed `@nanmicoder/dsh-agent-teams`. This fork no longer exports the copied `dsh-agent-teams-doctor` executable.

The configured Web profile contains Plugin Market `dshmarket@1.66.17`, original AgentTeams `0.1.23`, BrowserSkill DSH plugin `0.3.2`, and this locally linked package. Model proxy settings were preserved. Plugin Market was installed first; BrowserSkill was installed through its catalog and showed Enabled alongside original AgentTeams.

`C:/Projects/TrucX` is registered as a DSH workspace. Its `origin` remote is Azure DevOps organization `https://dev.azure.com/ihabzhaika`, project `Hobby`, repository `TrucX`. Its `github` remote is `Ihab-Zhaika/TrucX` on GitHub. For GitHub mode choose remote `github`; for Azure mode choose `origin`. The current branch is `main`; workers fetch the selected remote target rather than copying current checkout changes.

The working TrucX checkout already has an unfinished merge. Workspace registration and plugin setup did not resolve or modify those changes. No backlog run was activated during installation.

The BrowserSkill executable `0.3.2` was installed from Tencent's release with verified SHA-256, and its absolute path is configured in the profile. Microsoft Edge extension connection is deferred at the user's request. Browser automation therefore remains unverified; use browser verification only after the extension is connected. No separate BrowserSkill skill installation is needed for DSH.

A real DSH host probe in TrucX confirmed original team captain tools and `darkingdoom_status` coexist, the old custom status tool is absent, and an independent worker receives `danger-full-access` with approval `never`. All 94 focused tests pass. The launcher and installed plugin entry names are separate from original AgentTeams.

Open the Web GUI, select TrucX, create or open its main chat and use **DarKingDoom Plugin** in the session header. Set the ticket provider, exact ordered milestones, appropriate verification commands and parallelism. Configure or deselect optional memory/browser requirements according to the integrations available, then explicitly start the run. Future ordinary chats do not acquire orchestration authority automatically.
