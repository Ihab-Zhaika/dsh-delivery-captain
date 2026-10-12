# Worker messaging and blocker diagnosis

The owner's bug report requires readable assignments, preserved original teams while waiting, and no repeated wakeups when evidence has not changed.

1. Render initial assignments as readable Markdown with pretty JSON metadata and the ticket body as actual multiline source text. Send the full assignment once; bind acknowledgement to durable native user-message receipts and deterministic prompt IDs. Recovery sends compact checkpoint metadata instead.
2. Waiting and blocked reports preserve teams. Remove timer-based blocked relaunches; deduplicate acknowledged questions, blocker notices, identical guidance and delivered answers. One unexplained-idle checkpoint is permitted, then a durable blocker reaches the main session. Capacity includes blocked workers whose descendants still execute.
3. Require the activated main session to use a genuine original automatic AgentTeams diagnostic team for unresolved technical blockers, preserve its own repository checkout, and send actionable findings to workers. Missing devices/security clearance remain honest external prerequisites. AgentTeams does not need reinstalling; archived teams are historical evidence.
4. Reproduce lifecycle failures with runtime/controller regressions, test/build/review, deploy without restarting blocked worker assignments, and verify a real diagnostic team is invoked in the main chat.
