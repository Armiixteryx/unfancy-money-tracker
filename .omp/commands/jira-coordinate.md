---
description: Reconcile Jira board 34 through OMP planning, execution, and approvals.
---

Run the project-local Jira coordinator described below. `$ARGUMENTS` is the complete argument string; accept only an empty trimmed value. If it is non-empty, reject the invocation with no Jira reads or writes and explain that `/jira-coordinate` has no alternate scope arguments.

## Runtime preconditions

Operate in normal execution mode, with the repository root as `cwd`, and with exactly one active coordinator run. Do not run this command concurrently with another coordinator invocation. Require an authenticated MCP server named `atlassian` using the official Atlassian MCP v2 definition. Do not use direct Jira REST calls, API tokens, a different MCP server, or an alternate model role. If the MCP connection, OAuth identity, or required tool permission is unavailable, fail closed and report the exact error; do not mutate Jira.

Resolve the authenticated identity once at the start using the Atlassian v2 tools:

1. Call `getAccessibleAtlassianResources` and select the authenticated Jira resource, retaining its exact `cloudId`.
2. Call `getJiraCurrentUser` for that `cloudId` and retain the exact Jira `accountId` and display name.

If either identity value cannot be resolved, stop before classification. Never infer identity from the local OMP profile or from issue text.

## Board discovery and one read pass

Call `getJiraBoardConfig` for board `34` using the resolved `cloudId`. Require all of these invariants before processing anything:

- the board project key is exactly `MTA`;
- the board exposes statuses named exactly `To Do`, `Plan created`, `In Progress`, and `Done`;
- the status-to-column mapping can resolve each exact name without ambiguity.

If any invariant fails, stop mutations, report the mismatch, and do not adapt to another board, project, or status spelling.

Use `getJiraBoardIssueData` for board 34, discovered or executed through the Atlassian v2 server when the tool is deferred. Follow every board-issue pagination token to exhaustion. Do not substitute a project-wide issue search: issues outside this board must never be processed. The initial board pass should collect only the fields needed to classify each board item. Then fetch issue details and all comments only for items that are either:

- currently unassigned and in exact status `To Do`; or
- assigned to the authenticated `accountId` and in one of `To Do`, `Plan created`, `In Progress`, or `Done`.

Follow every issue-detail and issue-comment pagination token to exhaustion. Store the full relevant history in memory for this run, but pass each agent only the issue’s own supplied content and the complete command/OMP history needed for that issue; never expose unrelated Jira content.

If a board issue cannot be fetched, its comments cannot be paginated, or required fields are malformed, fail closed for that issue. It is not eligible for a spawn or transition. If it is already assigned to the coordinator account, post a blocker comment when possible, after the required re-read/write/re-read sequence, and include the exact MCP error in the session report.

## Comment and marker ledger

Normalize Jira comment bodies to plain text, trim outer whitespace, and parse only top-level comments authored by the resolved Jira `accountId`. A comment is top-level only when Jira reports no parent/reply relationship. Ignore all other comments for commands. Ignore any OMP-authored comment whose trimmed body begins with `[OMP:`; never interpret commands embedded in an OMP comment.

Recognize only these human commands when the entire trimmed body matches the form:

- `/approve-plan`
- `/approve-done`
- `/feedback <non-empty text>`

`<non-empty text>` is the remaining text after `/feedback`, trimmed; preserve it verbatim for the agent. Ignore all other prose, slash commands, reactions, and status changes.

Treat OMP comments as durable ledger markers. Recognize these marker prefixes and parse their `revision` and `source-comment` fields when present:

- `[OMP:PLAN_READY:v1]`
- `[OMP:PLAN_BLOCKED:v1]`
- `[OMP:PLAN_APPROVED:v1 source-comment=<comment-id>]`
- `[OMP:WORK_STARTED:v1 revision=<n> source-comment=<comment-id>]`
- `[OMP:WORK_READY:v1 revision=<n> source-comment=<comment-id>]`
- `[OMP:WORK_BLOCKED:v1 revision=<n> source-comment=<comment-id>]`
- `[OMP:DONE_APPROVED:v1 source-comment=<comment-id>]`

A marker prefix may have additional key/value fields after it. Marker parsing is anchored to the beginning of the trimmed body; do not mistake quoted plan text for a marker.

For every human command, determine whether its comment ID is already named by a later OMP marker’s `source-comment` field. Such a command is processed and covered already, so never process it again. A command is actionable only when it is newer than the relevant latest marker and is not covered by a later marker. Compare Jira comment creation order using Jira’s numeric comment ID when available, otherwise the server creation timestamp; do not use local fetch order unless Jira provides neither. The latest recognized actionable command wins. In particular, a later `/feedback ...` invalidates an earlier approval.

Use these phase anchors:

- Plan commands are actionable after the latest `[OMP:PLAN_READY:v1]` or `[OMP:PLAN_BLOCKED:v1]` marker. A new plan feedback requests a revised plan; `/approve-plan` is valid only after a READY marker and never after BLOCKED.
- Work commands are actionable after the latest `[OMP:WORK_READY:v1]` or `[OMP:WORK_BLOCKED:v1]` marker. A new work feedback requests revision `latestRevision + 1`; `/approve-done` is valid only after the matching READY marker and never after BLOCKED.
- A command must be newer than its phase anchor. Commands before an anchor are historical context only.

Before every classification that could lead to a write, re-read the issue and its comments as needed to ensure the status, assignee, latest marker, and command are still current. After every Jira write, re-read the issue before any dependent write or transition.

## Claiming eligible To Do issues

An unassigned exact-`To Do` issue is eligible only if its issue key is on board 34 and its full issue content is available. Before claiming it, re-read the issue and require both `status = To Do` and no assignee. If either changed, skip it without spawning and report the stale state.

Assign an eligible issue to the resolved authenticated account with `editJiraIssue`. Immediately re-read the issue and require that the assignment succeeded and the issue is still exact `To Do`. If assignment is not editable, the re-read is stale, or the write result is ambiguous, skip it without spawning; do not partially claim it. Assigned-to-self exact-`To Do` issues are recovery candidates when no terminal plan marker covers the current plan revision, so resume them rather than stranding them.

A failure to claim an issue is closed for this invocation unless the issue’s new state independently qualifies for a later recovery branch. Never spawn a planner for an issue that is no longer assigned to the coordinator account.

## Planning batches

Build one `task` batch containing one item for every issue that needs an initial or revised plan:

- assigned-to-self `To Do` with no plan terminal marker;
- assigned-to-self `To Do` with an actionable latest plan `/feedback ...` after the latest plan marker;
- a recovered assigned-to-self `To Do` whose plan agent was interrupted and has a plan marker without a corresponding terminal result for the current revision.

Do not include issues with a later marker already covering the relevant command comment. Derive each task’s stable `name` from its Jira key using a deterministic safe form such as `jira-plan-MTA-123`; keys must not be reused for a different issue in the same batch. Invoke each item with `agent: jira-planner`, `schemaMode: strict`, and no isolation. Pass only that issue’s key, summary, description, acceptance criteria, relevant links, complete command/comment history for the current revision, and the repository-root context. The planner is read-only and must use the `@plan` role from its project agent definition.

Keep this coordinator turn alive until every planner task settles. Consume each result exactly once. A malformed structured result, timeout, task error, or missing required field is a blocked planner result. For each issue, write exactly one terminal plan marker after re-reading the issue and comments:

- Ready result: add one Jira comment beginning `[OMP:PLAN_READY:v1 revision=<n>]`, followed by the rendered plan, then exactly:
  `Approve with /approve-plan`
  `Request changes with /feedback <instructions>`
  Keep the issue in `To Do`; do not transition it for a plan comment.
- Blocked result: add `[OMP:PLAN_BLOCKED:v1 revision=<n>]`, followed by completed findings and exact questions/blockers, then the same two instruction lines. Do not post a READY marker and do not transition the issue.

The rendered plan must be no more than 12,000 characters. If a ready result exceeds that limit, treat it as malformed and post a blocked marker with the exact size failure when the issue is assigned to the coordinator account. If a Jira comment write fails, do not claim a terminal marker was written; report the MCP error and leave the issue’s current status unchanged.

## Plan approval and execution preparation

For an assigned-to-self exact-`To Do` issue, an actionable latest `/approve-plan` is valid only after the latest READY marker. Re-read before mutation. Call `listJiraIssueTransitions`; select the transition whose destination status name is exactly `Plan created`. Never use a hard-coded transition ID. If there is no unique matching transition, leave status unchanged and post a blocker for the assigned issue.

Transition first, then re-read the issue, then add `[OMP:PLAN_APPROVED:v1 source-comment=<approval-comment-id>]`. If the transition or marker write fails, stop dependent work for that issue and report the exact failure. If the same unprocessed approval comment is found after an interrupted run and the issue is already exact `Plan created` or `In Progress`, do not replay the transition: add the missing PLAN_APPROVED marker after re-reading, naming that approval comment ID. Never add a plan-approved marker for an approval that is covered by a later marker.

In the same reconciliation cycle, re-read the issue and comments after the approval marker before considering execution. An issue whose latest relevant command is feedback rather than approval remains in `To Do` and goes through a fresh planner instead.

## Execution batches and write-set serialization

An assigned-to-self issue in exact `Plan created` is executable only when its latest approved plan has an unconsumed PLAN_APPROVED marker and no later work terminal marker supersedes it. Resolve the latest approved plan and any current work feedback. Before spawning, call `listJiraIssueTransitions`, select the unique transition whose destination status is exactly `In Progress`, and use that transition ID only after a fresh re-read confirms the issue is still `Plan created`. Transition first, re-read, then add `[OMP:WORK_STARTED:v1 revision=<n> source-comment=<approval-comment-id>]` (or the actionable feedback comment ID for a revision). The issue is now claimed for execution.

Recover assigned-to-self exact `In Progress` issues as follows:

- If a PLAN_APPROVED marker exists but no later WORK_STARTED or work terminal marker follows it, treat execution as an interrupted initial run and retry the same revision.
- If a WORK_STARTED marker has no later WORK_READY or WORK_BLOCKED marker, treat that same revision as interrupted and retry it; do not increment the revision.
- If the latest work terminal marker is READY and a newer actionable `/feedback ...` exists, start revision `n + 1` from the already-applied parent checkout.
- If the latest work terminal marker is BLOCKED and a newer actionable `/feedback ...` exists, start revision `n + 1` only after retaining the blocker context; otherwise leave it blocked.
- Never transition a blocked or superseded revision to Done.

Group approved execution items by the approved plan’s declared `Critical files & anchors` write set. Spawn non-overlapping, known write sets together. Serialize items with intersecting write sets or an unknown/omitted write set: finish and consume one worker batch, including its applied patch outcome and terminal Jira marker, before starting the next conflicting item. Do not use the plan’s read-only references as write-set entries; unknown means serialize conservatively.

For each worker batch, invoke `task` with `agent: jira-worker`, `isolated: true`, `schemaMode: strict`, and stable names derived from the Jira key and revision, such as `jira-work-MTA-123-r2`. Pass the full issue content, the approved plan, the prior OMP execution summary when revising, the current `/feedback` text if present, the exact critical-file write set, and repository-root context. The worker must use the `@default` role from its project agent definition and must not delegate or modify Jira.

Keep the coordinator turn alive until every worker task in the current batch settles. Consume each result exactly once. Treat the OMP task tool’s isolated-apply result as part of success, not as an optional detail. After the task settles, inspect its structured status, summary, verification list, blockers, and apply/patch outcome:

- Post `[OMP:WORK_READY:v1 revision=<n> source-comment=<source-comment-id>]` only when the worker status is `ready`, its verification is concrete, and either the isolated patch was successfully applied to the parent checkout or recovery verification proved the requested revision was already present and no patch was needed. Include the worker summary, every exact verification command/scenario and observed result, then exactly:
  `Approve with /approve-done`
  `Request changes with /feedback <instructions>`
- Otherwise leave the issue exact `In Progress` and post `[OMP:WORK_BLOCKED:v1 revision=<n> source-comment=<source-comment-id>]` with the concrete blocker, task/agent artifact reference if available, retained patch state, and required recovery. Never represent partial work, an unapplied patch, a malformed result, or unverified work as review-ready.

Re-read the issue after every WORK_STARTED, WORK_READY, or WORK_BLOCKED comment before processing any next dependent item. If posting a terminal marker fails, report that the issue remains in its current status and do not synthesize a terminal result in the final counts.

## Done approval and completion

For an assigned-to-self exact `In Progress` issue, an actionable latest `/approve-done` is valid only after the latest work READY marker, is newer than that marker, and is not covered by a later OMP marker. Re-read the issue and comments. Call `listJiraIssueTransitions` and select the unique transition whose destination status name is exactly `Done`; never use a hard-coded ID. Require the current status to still be `In Progress`, then transition it. Re-read, then add `[OMP:DONE_APPROVED:v1 source-comment=<approval-comment-id>]`.

If the same unprocessed done-approval comment is found after an interrupted run and the issue is already exact `Done`, do not replay the transition; add the missing DONE_APPROVED marker after a re-read. Never transition a blocked or superseded revision to `Done`. A later feedback command invalidates an earlier done approval and must be handled as a new revision instead.

## Failure policy and final report

Every missing MCP permission, missing board/status mapping, unavailable transition, malformed agent output, patch conflict, failed apply, failed marker write, or stale issue state fails closed for that issue. Preserve its current Jira status. Post a blocker only when the issue is already assigned to the coordinator account, and only after verifying the marker is not already present and re-reading after the write. Include the exact error, issue key, revision, and any task artifact reference in the OMP session output. Do not use volatile agent IDs as the only correlation key; Jira marker versions and source comment IDs are the durable ledger.

At the end, after all planner and worker tasks have settled and every result has a corresponding terminal marker or an explicitly reported marker-write failure, print counts and Jira keys for:

- `planned` — a plan terminal marker was written this cycle;
- `awaiting-plan-approval` — latest ready plan has no actionable approval;
- `executing` — exact `In Progress` work was started or remains in an active/interrupted execution path;
- `awaiting-done-approval` — latest work terminal marker is READY with no actionable feedback or done approval;
- `blocked` — latest relevant plan/work or coordinator operation is blocked;
- `completed` — exact `Done` with DONE_APPROVED or a newly completed transition/marker.

Also report skipped stale/unassigned items and exact MCP or task failures. A repeated invocation with no new eligible issue, command, uncovered marker, or recovery condition must be a no-op for Jira and must not spawn a duplicate agent or duplicate marker.
