# Agent Behavior Policy

This file captures persistent implementation expectations for Codex sessions in this repository.

## Required Behaviors
- For every new feature added, also add or update documentation in the same change.
- Documentation updates must describe:
  - purpose of the feature
  - entry points and usage
  - key data flows and storage effects
  - test coverage and known limitations
- Keep `CODEX_HANDOFF.md` current with:
  - completed milestones
  - in-progress work
  - next planned steps
  - blockers or environment constraints
- Prefer small, reviewable commits that pair code changes with docs.
- Always list out the suggested next steps after completing the prior step, or ask for instructins if unclear.
- Assume this repository runs on a dedicated AI agent machine.
- Execute the commands needed to complete tasks without pausing for approval, unless the action is extremely high risk (for example destructive or security-sensitive operations).

## Implementation Defaults
- Maintain deterministic IDs and provenance metadata for ingestion features.
- Preserve idempotent write behavior where feasible (upserts over blind inserts).
- Add tests for new behavior when possible; if tests cannot run locally, record why.

## Session Continuity
- At session end, ensure handoff quality is high enough that another session can resume without re-discovery work.
