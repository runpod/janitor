import { mastra } from "./dist/src/mastra/index.js";

const repoUrl = process.env.REPO_URL;
const repoName = process.env.REPO_NAME;

console.log(`Running Janitor agent for ${repoName}...`);

try {
	const result = await mastra
		.getAgent("janitor")
		.generate(`Please validate and fix the repository at ${repoUrl}`, {
			threadId: `janitor-${repoName}-${Date.now()}`,
			resourceId: repoName,
			maxSteps: 50,
		});

	console.log("Janitor agent completed successfully");
	console.log("Result:", result);

	// Save the result to a report file
	const report = {
		timestamp: new Date().toISOString(),
		repository: {
			name: repoName,
			url: repoUrl,
		},
		status: "success",
		agent_response: result,
		environment: {
			container_id: process.env.HOSTNAME,
			aws_region: process.env.AWS_REGION,
			s3_bucket: process.env.S3_BUCKET,
		},
	};

	const fs = await import("fs");
	const reportFile = `/app/reports/${repoName}-report.json`;
	fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
	console.log(`Report saved to: ${reportFile}`);

	// Exit successfully to close all handles
	process.exit(0);
} catch (error) {
	console.error("Janitor agent failed:", error);

	// Save error report
	const errorReport = {
		timestamp: new Date().toISOString(),
		repository: {
			name: repoName,
			url: repoUrl,
		},
		status: "error",
		error: error.message,
		stack: error.stack,
		environment: {
			container_id: process.env.HOSTNAME,
			aws_region: process.env.AWS_REGION,
			s3_bucket: process.env.S3_BUCKET,
		},
	};

	const fs = await import("fs");
	const reportFile = `/app/reports/${repoName}-error-report.json`;
	fs.writeFileSync(reportFile, JSON.stringify(errorReport, null, 2));
	console.log(`Error report saved to: ${reportFile}`);

	process.exit(1);
}
