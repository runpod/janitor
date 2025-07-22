# User Story

As a developer janitor, I want a repeatable “hot” deployment process driven by "make deploy" (as a replacement for "make deploy-code") so that each deploy:

- Always starts from a clean, git-free snapshot of my repo
- Installs production dependencies and builds the app
- Atomically switches to the new version with zero downtime
- Keeps only a fixed number of past releases for rollback

# Key Concepts

1. Server Layout

    - A `releases` folder holds timestamped builds
    - A `current` symlink points to the active release
    - A `shared` folder retains environment files or uploads across releases

2. Fresh Checkout

    - Every deploy clones (or archives) only the latest commit into a new timestamped temp directory
    - Strip out the `.git` folder so only source files remain

3. Shared Assets

    - Copy shared configuration or upload directories from `shared` into the new build

4. Install & Build

    - In the temp directory, run `pnpm install` in production mode with a frozen lockfile
    - Execute your Next.js build step

5. Atomic Swap

    - Move the fully prepared directory into `releases/<timestamp>`
    - Update the `current` symlink to point at that new release in one atomic operation

6. Zero-Downtime Reload

    - Signal your process manager (e.g. PM2, systemd) to reload using the new code and environment

7. Cleanup
    - After a successful swap, delete old release folders beyond your retention count

# Acceptance Criteria

- Running `make deploy` or equivalent always results in the live app serving the fresh build without interruption
- No `.git` folder remains on the server—only production artifacts
- Rollbacks are possible by repointing `current` to an earlier release
- Only the most recent N releases are retained to bound disk usage
