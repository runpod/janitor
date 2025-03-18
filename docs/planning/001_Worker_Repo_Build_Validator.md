# Worker Repository Build Validator

## User Story

As a repository maintainer, I want a CLI tool that can validate the build process of multiple worker repositories, so that I can quickly identify which repositories have Dockerfiles that can be successfully built.

## Epic

This user story is part of the "RunPod Worker Repository Auto Maintenance" epic, which aims to create automated tools for maintaining and validating RunPod worker repositories.

## Description

Create a TypeScript CLI script that:

1. Reads a file containing a list of repository names (e.g., "runpod-workers/worker-stable_diffusion_v2")
2. For each repository:
   - Checks out the repository if not already present, or pulls the latest version if already checked out
   - Locates the Dockerfile in the repository
   - Attempts to build the Docker image targeting the linux/amd64 platform
   - If the build is successful, attempts to start the Docker container to verify it runs correctly
3. Generates a report indicating:
   - Which repositories were successfully built and started
   - Which repositories failed to build or start and why

## Acceptance Criteria

- The script accepts a path to a text file containing repository names, one per line
- The script can handle both new repository checkouts and updates to existing repositories
- Docker builds are performed with the appropriate platform flag (linux/amd64)
- Successfully built images are started as containers to verify they run properly
- The script produces a clear success/failure report for each repository, including:
  - Build status (success/failure)
  - Container start status (success/failure)
  - Error information for troubleshooting failures
- Containers started for testing are properly cleaned up after validation

## Technical Notes

- Implement in TypeScript
- Use appropriate libraries for Git operations and process management
- Use direct Docker CLI commands (e.g., `docker build`, `docker run`) rather than a Docker API wrapper
- Ensure proper error handling for network issues, file access, and build failures
- Docker must be installed on the system where the script runs
- Include appropriate timeouts for container startup to detect hanging or failing containers
