# Janitor Agent

> AI-powered Docker repository validation and repair system using Mastra

The Janitor Agent uses a multi-agent architecture (based on [Mastra](https://mastra.ai)) to
automatically validate, repair, and enhance Docker repositories.

## 🤖 Agent Architecture

1. **Janitor Agent** - Orchestrates the entire process (validation, repair, feature addition)
2. **Dev Agent** - Diagnoses and repairs issues, implements new features
3. **PR Creator Agent** - Creates pull requests with fixes or new features on GitHub

## 🚀 Local Development

### Prerequisites

- Node.js (v22 or later) and npm
- Docker Desktop installed and running
- Basic environment setup completed (see [main README](../../README.md))

### Development Setup

```bash
# Navigate to the agent directory
cd packages/janitor-agent

# Install dependencies
npm install

# Start development server
npm run dev  # Opens Mastra interface at http://localhost:4111
```

### Environment Configuration

Create `.env` file in this directory with:

```bash
# Core API Keys (required)
ANTHROPIC_API_KEY=your_anthropic_key
GITHUB_PERSONAL_ACCESS_TOKEN=your_github_token

# Optional: Debug settings
MASTRA_LOG_LEVEL=debug
MASTRA_MODEL_PROVIDER=anthropic
```

> **Note**: For AWS deployment variables, see the main project
> [environment setup](../../README.md#environment-setup).

## 🧪 Testing and Development

### Available Scripts

| Script                             | Description                         |
| ---------------------------------- | ----------------------------------- |
| `npm run dev`                      | Start Mastra development server     |
| `npm run build`                    | Build TypeScript project            |
| `npm run test:janitor:validate`    | Test repository validation workflow |
| `npm run test:janitor:add-feature` | Test feature addition workflow      |

### Local Testing Workflows

**Repository Validation:**

```bash
npm run test:janitor:validate
```

- Clones example repository (TimPietrusky/worker-basic)
- Validates Dockerfile by building and running
- Attempts automatic repairs if validation fails
- Creates PR with fixes (if GitHub token configured)

**Feature Addition:**

```bash
npm run test:janitor:add-feature
```

- Adds standardized features (.runpod folder, hub.json, README badges)
- Validates repository still works after changes
- Creates PR with new features

### Agent Capabilities

- **GPU-Aware Validation**: Smart handling of CUDA vs non-CUDA Docker images
- **Repository Validation**: Clones repos, builds images, runs containers, analyzes logs
- **Automatic Repair**: Fixes common Docker, dependency, and configuration issues
- **Feature Addition**: Adds standardized features like RunPod Hub preparation
- **Pull Request Creation**: Automatically creates PRs with fixes and features
- **Smart Change Detection**: Only creates PRs when actual changes are made

## 📁 Project Structure

```
packages/janitor-agent/
├── src/mastra/
│   ├── agents/           # AI agents (janitor, dev, pr-creator)
│   ├── tools/            # Tools for agents (docker, git, file operations)
│   ├── workflows/        # Mastra workflows (docker validation)
│   └── utils/            # Utility functions and configurations
├── docker/               # Docker configuration for deployment
├── tests/                # Test scripts and scenarios
├── repos/                # Local repository cache (auto-created)
└── scripts/              # Development utility scripts
```

## 🛠️ Development Guidelines

### 🔥 **IMPORTANT: Development Conventions**

When working on this agent system, **always** follow the established patterns in:

**[`../../docs/conventions.md`](../../docs/conventions.md)** - **REQUIRED READING**

This document covers:

- Monorepo structure and tool implementation patterns
- Agent-to-agent communication patterns
- GPU-aware validation system
- Error handling and testing approaches
- Cross-platform development considerations

### Usage Examples

**Basic Repository Validation:**

```typescript
const result = await janitor.generate("Please validate the repository TimPietrusky/worker-basic");
```

**Adding Features:**

```typescript
const result = await janitor.generate(`
Add hub preparation feature to TimPietrusky/worker-basic:
- .runpod folder with hub.json and tests.json
- Add RunPod badge to README
`);
```

**Custom Repair Instructions:**

```typescript
const result = await janitor.generate(`
Validate and fix the repository user/broken-repo. 
Focus on Python dependency issues and Docker layer optimization.
`);
```

## 🐛 Troubleshooting

### Common Development Issues

**Docker not running:**

- Ensure Docker Desktop is installed and running

**API key errors:**

- Verify `ANTHROPIC_API_KEY` and `GITHUB_PERSONAL_ACCESS_TOKEN` are set in `.env`
- Ensure GitHub token has `repo` scope

**Memory/database issues:**

- The agent creates `mastra.db` for conversation memory
- Delete this file to reset agent memory if needed

**GPU validation errors:**

- System automatically detects GPU availability
- See conventions.md for details on GPU-aware validation logic

### Debug Mode

Enable detailed logging:

```bash
# In your .env file
MASTRA_LOG_LEVEL=debug
```

## 📝 Contributing to Agents

1. **Read conventions first**: Study [`../../docs/conventions.md`](../../docs/conventions.md)
2. **Make changes**: Modify agents, tools, or workflows following established patterns
3. **Test locally**: Use `npm run dev` and run validation tests
4. **Follow patterns**: Use direct tool integration (not MCP) unless specifically needed
5. **Submit PR**: Include clear description of changes and testing performed

## 🚀 Deployment

For AWS deployment and infrastructure management, see:

- **Main project setup**: [`../../README.md`](../../README.md)
- **Infrastructure details**: [`../../infra/README.md`](../../infra/README.md)
- **Operational procedures**: [`../../docs/conventions.md`](../../docs/conventions.md)

## 📄 License

MIT License - see [LICENSE](../../LICENSE) for details.
