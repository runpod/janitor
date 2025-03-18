import { checkoutGitRepository } from "./git-tools";

async function main() {
  try {
    console.log("Starting repository checkout...");

    // Get repository name from command line or use default
    const repoName =
      process.argv[2] || "runpod-workers/worker-stable_diffusion_v2";

    // Test checkout of a repository
    const result = await checkoutGitRepository(repoName);

    if (result.success) {
      console.log(`\n✅ Repository checkout succeeded at: ${result.path}`);
    } else {
      console.error(`\n❌ Repository checkout failed: ${result.error}`);
      process.exit(1);
    }
  } catch (error) {
    console.error("Unexpected error during checkout:", error);
    process.exit(1);
  }
}

// Run the test
main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
