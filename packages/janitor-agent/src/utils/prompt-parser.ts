// Enhanced prompt parser with DSL support for custom multi-repository prompts

export interface ParsedPrompt {
	repositories: Array<{ org: string; name: string }>;
	actionIntent: string;
	originalPrompt: string;
}

// Parse repositories from natural language prompts (legacy function)
export function parseRepositoriesFromPrompt(prompt: string): Array<{ org: string; name: string }> {
	const repositories: Array<{ org: string; name: string }> = [];

	// Common patterns for repository references:
	// - "org/repo-name"
	// - "RunPod/worker-basic"
	// - "validate these repos: repo1, repo2"
	// - "please check RunPod/worker-template and RunPod/worker-pytorch"

	// Pattern 1: Direct org/repo format
	const orgRepoPattern = /([a-zA-Z0-9\-_.]+)\/([a-zA-Z0-9\-_.]+)/g;
	let match;

	while ((match = orgRepoPattern.exec(prompt)) !== null) {
		const [, org, name] = match;
		repositories.push({ org, name });
	}

	// If we found repositories with org/name pattern, return those
	if (repositories.length > 0) {
		return repositories;
	}

	// Pattern 2: Repository names without org (assume RunPod as default)
	// Look for patterns like "validate worker-basic, worker-template"
	const repoOnlyPattern = /\b(worker-[a-zA-Z0-9\-_]+|[a-zA-Z0-9\-_]*worker[a-zA-Z0-9\-_]*)\b/g;
	const repoNames: string[] = [];

	while ((match = repoOnlyPattern.exec(prompt)) !== null) {
		const repoName = match[0];
		if (!repoNames.includes(repoName)) {
			repoNames.push(repoName);
		}
	}

	// Add default org for repo-only names
	for (const name of repoNames) {
		repositories.push({ org: "RunPod", name });
	}

	// Pattern 3: Look for comma-separated repository names after keywords
	if (repositories.length === 0) {
		const keywordPattern = /(?:validate|check|repos?|repositories?)[:]*\s*([^.!?]+)/i;
		const keywordMatch = keywordPattern.exec(prompt);

		if (keywordMatch) {
			const repoSection = keywordMatch[1];
			// Split by commas and clean up
			const potentialRepos = repoSection.split(/[,\s]+/).filter(item => {
				const trimmed = item.trim();
				// Must have reasonable repo name characteristics
				return trimmed.length > 2 && /^[a-zA-Z0-9\-_.\/]+$/.test(trimmed);
			});

			for (const item of potentialRepos) {
				const trimmed = item.trim();
				if (trimmed.includes("/")) {
					const [org, name] = trimmed.split("/");
					if (org && name) {
						repositories.push({ org, name });
					}
				} else {
					// Assume RunPod as default org
					repositories.push({ org: "RunPod", name: trimmed });
				}
			}
		}
	}

	// Remove duplicates
	const seen = new Set();
	return repositories.filter(repo => {
		const key = `${repo.org}/${repo.name}`;
		if (seen.has(key)) {
			return false;
		}
		seen.add(key);
		return true;
	});
}

// Enhanced DSL parser - main entry point
export function parsePromptWithDSL(input: string): ParsedPrompt {
	// Check if input uses DSL format
	if (input.includes("# PROMPT") && input.includes("# REPOS")) {
		return parseDSLFormat(input);
	}

	// Fallback to legacy parsing for backward compatibility
	return parseLegacyFormat(input);
}

// Parse DSL format: # PROMPT ... # REPOS ...
function parseDSLFormat(input: string): ParsedPrompt {
	const promptMatch = input.match(/# PROMPT\s*([\s\S]*?)(?=# REPOS|$)/i);
	const reposMatch = input.match(/# REPOS\s*([\s\S]*?)$/i);

	if (!promptMatch || !reposMatch) {
		throw new Error("Invalid format. Expected # PROMPT and # REPOS sections.");
	}

	const actionIntent = promptMatch[1].trim();
	const reposSection = reposMatch[1].trim();

	// Parse repositories from the REPOS section
	const repositories = parseRepositoriesFromSection(reposSection);

	if (repositories.length === 0) {
		throw new Error("No valid repositories found in # REPOS section.");
	}

	return {
		repositories,
		actionIntent,
		originalPrompt: input,
	};
}

// Parse repositories from dedicated REPOS section
function parseRepositoriesFromSection(reposSection: string): Array<{ org: string; name: string }> {
	const repositories: Array<{ org: string; name: string }> = [];

	// Split by newlines and commas, clean up
	const repoLines = reposSection
		.split(/\n|,/)
		.map(line => line.trim())
		.filter(line => line.length > 0)
		.map(line => line.replace(/^[-*]\s*/, "")); // Remove bullet points

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

// Parse legacy format for backward compatibility
function parseLegacyFormat(prompt: string): ParsedPrompt {
	// Use existing logic for backward compatibility
	const repositories = parseRepositoriesFromPrompt(prompt);

	return {
		repositories,
		actionIntent: prompt,
		originalPrompt: prompt,
	};
}

// Generate repository-specific prompt from DSL action intent
export function generateRepositoryPrompt(
	actionIntent: string,
	repository: { org: string; name: string }
): string {
	const repoRef = `${repository.org}/${repository.name}`;
	return `${actionIntent}\n\nRepository: ${repoRef}`;
}

// Test examples for validation
export function testPromptParser() {
	const testCases = [
		"please validate these repos: RunPod/worker-basic",
		"validate RunPod/worker-basic, RunPod/worker-template",
		"check if worker-basic and worker-template build correctly",
		"run validation on RunPod/worker-basic and create a PR if fixes are needed",
		"validate these repositories: worker-basic, worker-template, worker-pytorch",
		// DSL examples
		`# PROMPT
Add comprehensive logging with structured JSON output

# REPOS
- worker-basic
- worker-template`,
		`# PROMPT
Fix Dockerfile issues and optimize for production

# REPOS
worker-basic, worker-template, worker-pytorch`,
	];

	console.log("🧪 Testing enhanced prompt parser with DSL support...");
	for (const testCase of testCases) {
		try {
			const result = parsePromptWithDSL(testCase);
			console.log(`Input: "${testCase}"`);
			console.log(
				`Repositories: ${result.repositories.map(r => `${r.org}/${r.name}`).join(", ")}`
			);
			console.log(`Action Intent: "${result.actionIntent}"`);
			console.log("");
		} catch (error) {
			console.log(`Input: "${testCase}"`);
			console.log(`Error: ${error instanceof Error ? error.message : String(error)}`);
			console.log("");
		}
	}
}
