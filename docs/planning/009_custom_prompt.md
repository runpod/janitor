# Custom Multi-Repository Prompt Handling

## User Story

As a Janitor maintainer, I want to send custom natural language prompts that apply to multiple repositories while preserving my specific intent and instructions, so that I can perform diverse tasks beyond validation (like adding features, fixing issues, or creating PRs) across multiple repositories without being limited to hardcoded "validate" prompts.

## Description

Enhance the current multi-repository prompt system to preserve and forward the user's actual intent instead of replacing it with a generic "validate" message:

1. **Preserve User Intent**: Extract repositories from prompts while maintaining the original action/instruction context
2. **Flexible Actions**: Support any type of instruction (validate, fix, add feature, create PR, etc.) across multiple repositories
3. **Custom Prompt Forwarding**: Send each repository the user's original intent with repository-specific context
4. **Intent Recognition**: Parse both repositories and action intent from complex natural language prompts
5. **Database Enhancement**: Store original user prompts alongside repository-specific results for audit trail
6. **Backward Compatibility**: Maintain existing validation-focused workflows while enabling broader functionality

The enhanced system should handle prompts like:

- `"add logging to worker-basic, worker-template"`
- `"fix the dockerfile in worker-basic, worker-template and create PR"`
- `"validate worker-basic, worker-template and add feature X if validation passes"`
- `"check if worker-basic, worker-template build correctly, fix any issues found"`

## Acceptance Criteria

- Users can send custom prompts with multiple repositories where the action intent is preserved and applied to each repository
- The system extracts both repository lists AND action intent from natural language prompts
- Each repository receives a customized prompt like: `"add logging to this repository: RunPod/worker-basic"` instead of hardcoded `"validate this repository"`
- The original user prompt is stored in the database for audit trail and context
- Repository-specific prompts maintain user's original intent while providing repository context
- The system supports complex multi-action prompts: `"validate these repos and create PR if fixes needed: worker-basic, worker-template"`
- Backward compatibility: existing validation-only prompts continue to work unchanged
- Database stores both original prompt and repository-specific generated prompts for debugging
- The agent receives meaningful, context-rich prompts that enable diverse task execution
- Error handling when user intent cannot be reliably extracted or is ambiguous
- Support for conditional prompts: `"if worker-basic validates successfully, add feature X"`

## Technical Notes

- **Simple DSL Format**:

    ```
    PROMPT:
    [Your complete instruction - can contain code, examples, detailed context]

    REPOS:
    [Simple list of repositories, one per line or comma-separated]
    ```

- **Enhanced Prompt Parser** (`prompt-parser.ts`):

    ```typescript
    export interface ParsedPrompt {
        repositories: Array<{ org: string; name: string }>;
        actionIntent: string;
        originalPrompt: string;
        promptType: "validation" | "feature-addition" | "fix" | "mixed" | "custom";
    }

    export function parsePromptWithDSL(input: string): ParsedPrompt {
        // Check if input uses DSL format
        if (input.includes("PROMPT:") && input.includes("REPOS:")) {
            return parseDSLFormat(input);
        }

        // Fallback to legacy parsing for backward compatibility
        return parseLegacyFormat(input);
    }

    function parseDSLFormat(input: string): ParsedPrompt {
        const promptMatch = input.match(/PROMPT:\s*([\s\S]*?)(?=REPOS:|$)/i);
        const reposMatch = input.match(/REPOS:\s*([\s\S]*?)$/i);

        if (!promptMatch || !reposMatch) {
            throw new Error("Invalid DSL format. Expected PROMPT: and REPOS: sections.");
        }

        const actionIntent = promptMatch[1].trim();
        const reposSection = reposMatch[1].trim();

        // Parse repositories from the REPOS section
        const repositories = parseRepositoriesFromSection(reposSection);

        return {
            repositories,
            actionIntent,
            originalPrompt: input,
            promptType: classifyPromptType(actionIntent),
        };
    }

    function parseRepositoriesFromSection(
        reposSection: string,
    ): Array<{ org: string; name: string }> {
        const repositories: Array<{ org: string; name: string }> = [];

        // Split by newlines and commas, clean up
        const repoLines = reposSection
            .split(/\n|,/)
            .map((line) => line.trim())
            .filter((line) => line.length > 0)
            .map((line) => line.replace(/^[-*]\s*/, "")); // Remove bullet points

        for (const line of repoLines) {
            if (line.includes("/")) {
                const [org, name] = line.split("/");
                if (org && name) {
                    repositories.push({ org: org.trim(), name: name.trim() });
                }
            } else {
                // Default to RunPod organization
                repositories.push({ org: "RunPod", name: line.trim() });
            }
        }

        return repositories;
    }

    function parseLegacyFormat(prompt: string): ParsedPrompt {
        // Use existing logic for backward compatibility
        const repositories = parseRepositoriesFromPrompt(prompt);

        return {
            repositories,
            actionIntent: "validate", // Default for legacy prompts
            originalPrompt: prompt,
            promptType: "validation",
        };
    }
    ```

- **Repository-Specific Prompt Generation**:

    ```typescript
    function generateRepositoryPrompt(actionIntent: string, repository: { org: string; name: string }): string {
        const repoRef = `${repository.org}/${repository.name}`;

        // For DSL format, the actionIntent IS the complete instruction
        return `${actionIntent}
    ```

Repository: ${repoRef}

Please apply the above instructions to this specific repository.`;
}

````

- **Enhanced Database Schema**:

    ```sql
    -- Add columns to existing validation_results table
    ALTER TABLE validation_results ADD COLUMN original_prompt TEXT;
    ALTER TABLE validation_results ADD COLUMN repository_prompt TEXT;
    ALTER TABLE validation_results ADD COLUMN prompt_type VARCHAR(50) DEFAULT 'validation';

    -- Index for prompt analysis
    CREATE INDEX idx_validation_results_prompt_type ON validation_results(prompt_type);
    ```

- **Server Enhancement** (`server.ts`):

    ```typescript
    app.post("/api/prompt", async (req, res) => {
        const { message } = req.body;
        const runId = uuidv4();

        // Enhanced parsing with intent preservation
        const parsedPrompt = parsePromptWithDSL(message);

        if (parsedPrompt.repositories.length === 0) {
            return res.status(400).json({
                error: "Could not identify repositories in prompt",
            });
        }

        // Store original context in database
        for (const repo of parsedPrompt.repositories) {
            const repositoryPrompt = generateRepositoryPrompt(parsedPrompt.actionIntent, repo);

            await storeValidationResult({
                run_id: runId,
                repository_name: repo.name,
                organization: repo.org,
                validation_status: "running",
                original_prompt: parsedPrompt.originalPrompt,
                repository_prompt: repositoryPrompt,
                prompt_type: parsedPrompt.promptType,
                results_json: {
                    status: "started",
                    action_intent: parsedPrompt.actionIntent,
                    timestamp: new Date().toISOString(),
                },
            });
        }

        // Process with custom prompts
        processCustomPromptRequest(runId, parsedPrompt).catch((error) => {
            console.error(`❌ Error processing custom prompt ${runId}:`, error);
        });
    });

    async function processCustomPromptRequest(runId: string, parsedPrompt: ParsedPrompt) {
        for (const repo of parsedPrompt.repositories) {
            const customPrompt = generateRepositoryPrompt(parsedPrompt.actionIntent, repo);

            // Send CUSTOM prompt to agent instead of hardcoded "validate"
            const agent = mastra.getAgent("janitor");
            const response = await agent.generate(customPrompt);

            await updateValidationResult(runId, repo.name, {
                validation_status: "success",
                results_json: {
                    status: "completed",
                    response: response,
                    original_intent: parsedPrompt.actionIntent,
                    repository_prompt: customPrompt,
                    timestamp: new Date().toISOString(),
                },
            });
        }
    }
    ```

## Example Usage

```bash
# Simple feature addition using DSL format
make prompt PROMPT="
PROMPT:
Add comprehensive logging with structured JSON output and performance metrics.

REPOS:
- worker-basic
- worker-template
"

# Complex instruction with code examples
make prompt PROMPT="
PROMPT:
Implement health check endpoints with the following specifications:

1. Add a /health endpoint that returns JSON status
2. Include memory usage, CPU info, and container uptime
3. Use this exact implementation:

\`\`\`python
import psutil
import time
import json
from datetime import datetime

@app.route('/health')
def health_check():
    return json.dumps({
        'status': 'healthy',
        'timestamp': datetime.utcnow().isoformat(),
        'uptime': time.time() - start_time,
        'memory_usage': psutil.virtual_memory().percent,
        'cpu_usage': psutil.cpu_percent()
    })
\`\`\`

4. Add proper error handling and logging
5. Update the README with health check documentation

REPOS:
worker-basic, worker-template, worker-pytorch
"

# Dockerfile fixes with detailed context
make prompt PROMPT="
PROMPT:
Fix any Dockerfile issues and optimize for production:

- Use multi-stage builds to reduce image size
- Add proper security practices (non-root user)
- Optimize layer caching for faster builds
- Add health checks in Dockerfile
- Ensure CUDA compatibility for GPU workloads
- Create comprehensive PR with before/after comparison

REPOS:
- RunPod/worker-basic
- RunPod/worker-template
"

# Backward compatibility - legacy format still works
make prompt PROMPT="validate worker-basic, worker-template"

# Query results (now shows DSL context)
make query-results RUN_ID=550e8400-e29b-41d4-a716-446655440000
# Output includes:
# Original Prompt: [Full DSL with PROMPT: and REPOS: sections]
# Repository Prompt: [Complete instruction + repository context]
# Action Intent: [The actual instruction from PROMPT: section]
````

## API Examples

````bash
# DSL format via HTTP
curl -X POST http://instance-ip:3000/api/prompt \
  -H "Content-Type: application/json" \
  -d '{
    "message": "PROMPT:\nAdd prometheus metrics with custom labels and histogram buckets.\n\nREPOS:\n- worker-basic\n- worker-template"
  }'

# Response includes DSL analysis
{
  "runId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "started",
  "message": "Starting custom prompt processing for 2 repositories",
  "actionIntent": "Add prometheus metrics with custom labels and histogram buckets.",
  "promptType": "feature-addition",
  "repositories": ["RunPod/worker-basic", "RunPod/worker-template"]
}

# Complex multi-line DSL prompt
curl -X POST http://instance-ip:3000/api/prompt \
  -H "Content-Type: application/json" \
  -d '{
    "message": "PROMPT:\nImplement circuit breaker pattern with exponential backoff:\n\n```python\nclass CircuitBreaker:\n    def __init__(self, threshold=5, timeout=60):\n        self.threshold = threshold\n        self.timeout = timeout\n        # ... implementation\n```\n\nAdd comprehensive tests and documentation.\n\nREPOS:\nworker-basic, worker-template, worker-pytorch"
  }'

# Legacy format still supported
curl -X POST http://instance-ip:3000/api/prompt \
  -H "Content-Type: application/json" \
  -d '{
    "message": "validate worker-basic, worker-template"
  }'
````

## Migration Strategy

1. **Phase 1**: Enhance prompt parser to extract intent while maintaining backward compatibility
2. **Phase 2**: Update database schema to store original prompts and repository-specific prompts
3. **Phase 3**: Modify server to generate custom repository prompts instead of hardcoded "validate"
4. **Phase 4**: Test with existing validation prompts to ensure no regression
5. **Phase 5**: Test with new custom action prompts (add feature, fix, etc.)
6. **Phase 6**: Update documentation and examples for new capabilities
7. **Phase 7**: Add prompt type classification for better agent instruction context

## Backward Compatibility

```typescript
// Legacy format (still supported)
"validate worker-basic, worker-template"// → Parser detects no DSL, uses legacy parsing
// → Generates: "Please validate this repository: RunPod/worker-basic"

// New DSL format
`PROMPT:
Add comprehensive logging with structured output

REPOS:
worker-basic, worker-template`// → Parser detects DSL format
// → Generates: "Add comprehensive logging with structured output\n\nRepository: RunPod/worker-basic\n\nPlease apply the above instructions to this specific repository."

// Complex DSL with code examples
`PROMPT:
Implement health checks using this exact code:

\`\`\`python
@app.route('/health')
def health():
    return {'status': 'ok', 'timestamp': time.time()}
\`\`\`

Add proper error handling and tests.

REPOS:
- worker-basic
- worker-template`;
// → Full instruction preserved, no parsing complexity
```

**Key Benefits of DSL Approach:**

1. **Zero Ambiguity**: Clear separation between instruction and repositories
2. **No Parsing Complexity**: No regex patterns or LLM extraction needed
3. **Unlimited Context**: Instructions can contain code, examples, detailed specs
4. **Backward Compatible**: Legacy prompts continue working unchanged
5. **Debugging Friendly**: Easy to see exactly what instruction each repo received
6. **Cost Effective**: No LLM calls needed for intent extraction

This enhancement transforms the system from a validation-only tool into a flexible multi-repository task execution platform while maintaining all existing functionality and introducing rich audit trails for debugging and analysis.
