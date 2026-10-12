# Editable stopped-run settings

**Goal:** A stopped coordinator can edit and explicitly save delivery settings without starting work or losing history.

**Design:** Repository/provider/remote/target identity stays bound to the same run. Save validates the current repository catalog on the host and persists operational preferences while stopped. Ticket selection is visible, so clearing a trial allowlist really enables future eligible intake. Existing tasks retain immutable assignment settings; new settings apply to future tickets. Resume is a separate explicit action. Concurrent Stop/Resume/configuration changes cannot race a save into a running run.

- [x] Reproduce locked form and add failing UI/controller regressions.
- [x] Add stopped-only configuration mutation, identity guards, quiescence checks and assignment snapshots.
- [x] Enable stopped form, repository context validation and Save configuration; preserve dirty drafts across refresh.
- [x] Verify old task contracts/history and new admissions; typecheck/build/full tests/review.
- [x] Reload the stopped host without resuming the user's flow, verify the installed endpoint, commit and update draft PR.
