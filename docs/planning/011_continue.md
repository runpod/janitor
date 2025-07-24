# User Story

As a developer janitor, I want a "continue" command driven by "make continue" so that when validation runs are interrupted or fail to complete, I can:

- Identify orphaned database entries with status="running" that never completed
- Resume processing for incomplete repositories from interrupted runs
- Cancel/cleanup orphaned entries that are no longer needed
- View detailed status of incomplete runs before deciding to continue or cancel them

# Key Concepts

1. Orphaned Validation Detection

    - Query the database for entries with `validation_status="running"` or `"queued"` that are older than a configurable threshold (e.g., 5 hours)
    - Group orphaned entries by `run_id` to show which runs were interrupted
    - Display repository details, timestamps, and original prompts for context

2. Interactive Run Management

    - Present incomplete runs with options to continue, cancel, or view details
    - Allow selection of specific runs to resume or multiple runs to batch process
    - Confirm actions before execution to prevent accidental processing

3. Resume Processing Logic

    - For continued runs, reuse existing `run_id` and preserve original prompt context
    - Process only repositories with `validation_status="running"` or `"queued"` from the selected run
    - Update database immediately as repositories complete (maintaining existing pattern)

4. Database Operations

    - Add `getOrphanedValidationRuns()` function to query running entries older than threshold
    - Add `cancelValidationRun()` function to mark orphaned entries as "cancelled"
    - Leverage existing `processCustomPromptRequest()` logic for resume processing

5. Server Integration

    - Add new endpoint `/api/continue` to handle continuation requests
    - Add new endpoint `/api/cancel/:runId` to cancel specific runs
    - Reuse existing processing workflow but filter to only incomplete repositories

6. Make Command Interface

    - `make continue` - Interactive interface to view and manage incomplete runs
    - `make continue RUN_ID=uuid` - Continue specific run by ID
    - `make cancel RUN_ID=uuid` - Cancel specific run and mark repositories as cancelled

7. Cleanup and Recovery

    - Mark resumed repositories as "running" with updated timestamp before processing
    - Handle edge cases where repositories were already processed but not marked complete
    - Maintain audit trail of continuation actions in database

# Acceptance Criteria

- Running `make continue` shows a list of incomplete runs with repository counts and age
- Continuing a run processes only the incomplete repositories using original prompt context
- Database entries are properly updated as continued repositories complete processing
- Cancelled runs are marked appropriately and excluded from future continue operations
- The system handles edge cases gracefully (no orphaned runs, already completed runs, etc.)
- Continue operations integrate seamlessly with existing validation workflow and UI
- All database operations follow existing Drizzle ORM patterns and schema
