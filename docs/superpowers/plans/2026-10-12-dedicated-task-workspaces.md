# Dedicated task workspaces

The owner's correction defines a dedicated session as a registered DSH workspace for the task worktree, with its ordinary root session attached beneath it. The existing worktree/session identities and their histories must be preserved.

1. Use the native workspace registry's idempotent create API, then sessionController.create with workspaceId (never both workspaceId and cwd). Give new workspaces repo/ticket labels and new or legacy generic sessions ticket titles; preserve customized titles.
2. Register saved prepared tasks on host restore, including completed and stopped tasks, without prompting models. Continue current permissions, AgentTeams and scheduler isolation. Large ticket follow-ups get their own workspace when admitted normally.
3. Reproduce missing grouping with runtime/controller regressions; verify registration precedes prompting, stable identity on recovery, failure propagation, and preservation of session titles. Build, verify, review and install. Confirm existing #448/#371 groups in the real sidebar.
