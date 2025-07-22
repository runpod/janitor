# Contributing to Janitor Agent

This guide explains how to contribute to the Janitor Agent project and test your changes properly.

## Getting Started

### Prerequisites

1. Set up environment variables in `.env`:

    ```bash
    ANTHROPIC_API_KEY=your-key
    GITHUB_PERSONAL_ACCESS_TOKEN=your-token
    SUPABASE_URL=your-supabase-url
    SUPABASE_ANON_KEY=your-anon-key
    SUPABASE_SERVICE_ROLE_KEY=your-service-key
    SUPABASE_DB_PASSWORD=your-db-password
    ```

2. Install dependencies:

    ```bash
    cd packages/janitor-agent
    npm install
    ```

3. Apply database schema:
    ```bash
    npm run db:migrate
    ```

## Making Changes

### Database Schema Changes

**CRITICAL: All database schema changes must be made through Drizzle ORM.**

1. Edit `packages/janitor-agent/src/db/schema.ts`
2. Generate migration: `npm run db:generate`
3. Apply migration: `npm run db:migrate`
4. Update TypeScript interfaces in `src/utils/supabase.ts` if needed

### Code Changes

Follow patterns in `/docs/conventions.md`:

- Use direct tool integration with `createTool` from `@mastra/core/tools`
- Handle GPU/CUDA detection properly
- Include proper error handling and timeouts
- Follow cross-platform considerations

## Testing Your Changes

### Option 1: Test Agent Directly (Recommended for Development)

Test structured output and validation logic:

```bash
# Test with default repository
npm run test:janitor:validate

# Test with specific repository
npm run test:janitor:validate -- --repo "RunPod/worker-basic"
```

**What this validates:**

- Schema-enforced JSON response
- `validation_passed` boolean accuracy
- All expected fields present

### Option 2: Test Full Server API (End-to-End)

Test complete server flow including database storage:

1. Start the server:

    ```bash
    npm run start
    ```

2. In another terminal:

    ```bash
    # Test with default repository
    npm run test:server:structured

    # Test with specific repository
    npm run test:server:structured "RunPod/worker-basic"
    ```

**What this validates:**

- HTTP request handling
- Database storage accuracy
- Status mapping: `validation_passed` → `validation_status`

### Option 3: Integration Testing

Test on actual GPU instance:

```bash
# Deploy changes
make deploy-code

# Test validation
make prompt PROMPT="validate TimPietrusky/worker-basic"

# Check results
make query-results
```

## Expected Test Results

### Structured Output Validation

Your changes should produce:

```json
{
    "validation_passed": true,
    "status": "passed",
    "action": "validate",
    "details": "Repository validation completed successfully",
    "pr_status": null,
    "pr_url": null
}
```

### Database Storage

- `validation_status: "success"` only when `validation_passed: true`
- `validation_status: "failed"` when `validation_passed: false`
- Accurate reflection of actual validation outcomes

## Commit Guidelines

Follow Angular conventional commit format with lowercase:

```
type(scope): description

Examples:
feat(agent): add gpu detection for cuda validation
fix(api): handle expired github tokens properly
docs(readme): update installation instructions
test(validation): add structured output test cases
```

## Pull Request Process

1. Test your changes locally using the options above
2. Ensure all tests pass
3. Follow commit message conventions
4. Create PR with clear description of changes
5. Include test results in PR description

## Debugging

If tests fail, check:

1. Environment variables are set correctly
2. Database schema is up to date: `npm run db:migrate`
3. Server is running (for server tests): `npm run start`
4. API keys are valid

## Common Issues

- **Database schema out of sync**: Run `npm run db:migrate`
- **Missing database password**: Add `SUPABASE_DB_PASSWORD` to `.env`
- **GPU errors on non-GPU instances**: System handles this automatically
- **Migration fails**: Check Supabase project status and credentials

## Development Commands

```bash
# Database management
npm run db:generate    # Generate migration from schema changes
npm run db:migrate     # Apply migrations
npm run db:studio      # Open Drizzle Studio

# Testing
npm run test:docker-validation
npm run test:janitor-add-feature
npm run test:pr-creator

# Instance management
make start             # Start GPU instance
make stop              # Stop instance
make deploy-code       # Deploy code to instance
make logs              # View real-time logs
```

Your contributions help make repository validation more accurate and reliable! 🎉
