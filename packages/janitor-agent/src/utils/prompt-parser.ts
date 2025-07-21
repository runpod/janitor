// Parse repositories from natural language prompts
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

// Test examples for validation
export function testPromptParser() {
	const testCases = [
		"please validate these repos: RunPod/worker-basic",
		"validate RunPod/worker-basic, RunPod/worker-template",
		"check if worker-basic and worker-template build correctly",
		"run validation on RunPod/worker-basic and create a PR if fixes are needed",
		"validate these repositories: worker-basic, worker-template, worker-pytorch",
	];

	console.log("🧪 Testing prompt parser...");
	for (const testCase of testCases) {
		const result = parseRepositoriesFromPrompt(testCase);
		console.log(`Input: "${testCase}"`);
		console.log(`Output: ${result.map(r => `${r.org}/${r.name}`).join(", ")}`);
		console.log("");
	}
}
