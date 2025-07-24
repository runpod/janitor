# Database Results Schema for UI

This document explains how to interpret validation results stored in the database for building user interfaces.

## Overview

The janitor system stores validation results in the `validation_results` table with two key fields:

- `validation_status`: Overall status of the validation process
- `results_json`: Detailed structured results from the validation

## validation_status Field

| Value         | Meaning                 | UI Display       | Color  |
| ------------- | ----------------------- | ---------------- | ------ |
| `"queued"`    | Waiting to be processed | 📋 Queued        | Gray   |
| `"running"`   | Currently processing    | 🔄 Processing... | Blue   |
| `"success"`   | Validation passed       | ✅ Passed        | Green  |
| `"failed"`    | Validation failed       | ❌ Failed        | Red    |
| `"cancelled"` | Processing cancelled    | ❌ Cancelled     | Orange |

## results_json Structure

The `results_json` field contains a structured object with the following properties:

```typescript
{
  status: "passed" | "fixed" | "feature_added" | "failed" | "unfixable" | "error",
  action: "validate" | "validate_and_repair" | "add_feature" | "error",
  details: string,                    // Human-readable description
  validation_passed: boolean,         // Final validation result
  pr_status?: "created" | "updated" | "failed" | "no_changes" | "not_applicable",
  pr_url?: string,                    // GitHub PR URL if created
  error_message?: string,             // Error details if failed
  timestamp: string,                  // ISO timestamp
  repository: string,                 // "owner/repo-name"
  janitor_response?: string           // Full agent response
}
```

### Status Values

| Status            | Description                                               |
| ----------------- | --------------------------------------------------------- |
| `"passed"`        | Initial validation succeeded, no repairs needed           |
| `"fixed"`         | Validation initially failed but was successfully repaired |
| `"feature_added"` | Feature was successfully added to the repository          |
| `"failed"`        | Validation failed and could not be automatically fixed    |
| `"unfixable"`     | Multiple repair attempts failed                           |
| `"error"`         | Tool execution or system error occurred                   |

### Action Values

| Action                  | Description                                  |
| ----------------------- | -------------------------------------------- |
| `"validate"`            | Only validation was performed                |
| `"validate_and_repair"` | Validation + repair workflow was used        |
| `"add_feature"`         | Feature addition workflow was used           |
| `"error"`               | Could not complete due to system/tool errors |

### PR Status Values

| PR Status          | Description                                   |
| ------------------ | --------------------------------------------- |
| `"created"`        | Pull request was successfully created         |
| `"updated"`        | Existing pull request was updated             |
| `"failed"`         | Pull request creation failed                  |
| `"no_changes"`     | No changes detected, no PR needed             |
| `"not_applicable"` | PR creation not applicable for this operation |

## UI Implementation Examples

### Status Badge Component

```typescript
const getStatusColor = (validation_status: string) => {
  switch(validation_status) {
    case "queued": return "gray"
    case "running": return "blue"
    case "success": return "green"
    case "failed": return "red"
    case "cancelled": return "orange"
    default: return "gray"
  }
}

const StatusBadge = ({ validation_status }) => (
  <Badge color={getStatusColor(validation_status)}>
    {validation_status.toUpperCase()}
  </Badge>
)
```

### Action Description

```typescript
const getActionText = (results_json: any) => {
    switch (results_json.action) {
        case "validate":
            return "Validation only";
        case "validate_and_repair":
            return "Validation + Repair";
        case "add_feature":
            return "Feature Addition";
        case "error":
            return "System Error";
        default:
            return "Unknown";
    }
};
```

### PR Link Display

```typescript
const PRLink = ({ results_json }) => {
  if (results_json.pr_url && results_json.pr_status === "created") {
    return (
      <a href={results_json.pr_url} target="_blank" rel="noopener noreferrer">
        View Pull Request →
      </a>
    )
  }
  return null
}
```

## Key Fields for UI Development

### Essential Display Fields

- **Primary Status**: `validation_status` (for overall state indication)
- **Repository**: `results_json.repository` (repository identifier)
- **Details**: `results_json.details` (human-readable description)
- **Timestamp**: `results_json.timestamp` (for sorting/filtering)

### Conditional Fields

- **PR Link**: `results_json.pr_url` (show if PR was created)
- **Error Info**: `results_json.error_message` (show if validation failed)
- **Action Type**: `results_json.action` (for filtering/categorization)

### Advanced Fields

- **Full Response**: `results_json.janitor_response` (for detailed logs/debugging)
- **Validation Result**: `results_json.validation_passed` (boolean validation result)

## Query Examples

### Get Recent Results

```sql
SELECT * FROM validation_results
ORDER BY created_at DESC
LIMIT 20;
```

### Filter by Status

```sql
SELECT * FROM validation_results
WHERE validation_status = 'failed'
ORDER BY created_at DESC;
```

### Get Results for Specific Run

```sql
SELECT * FROM validation_results
WHERE run_id = 'your-run-id'
ORDER BY created_at ASC;
```

### Search by Repository

```sql
SELECT * FROM validation_results
WHERE repository_name ILIKE '%worker-basic%'
ORDER BY created_at DESC;
```
