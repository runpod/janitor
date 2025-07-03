# Janitor Agent

> AI-powered Docker repository validation and repair system

The Janitor Agent uses a multi-agent architecture (based on [Mastra](https://mastra.ai)) to
automatically validate, repair, and enhance Docker repositories.

## 🤖 Agents

1. **Janitor** - Orchestrates the entire process (validation, repair, feature addition)
2. **Dev** - Diagnoses and repairs issues, implements new features
3. **PR Creator** - Creates pull requests with fixes or new features on GitHub

## 🚀 Getting Started

### Prerequisites

- Node.js (v22 or later)
- npm
- Docker Desktop installed and running
- API keys:
    - [Anthropic API key](https://console.anthropic.com/settings/keys) - Create an account and get
      your API key from the console
    - [GitHub Personal Access Token](https://github.com/settings/tokens) - Create a token with
      `repo` scope
    - [RunPod API key](https://www.runpod.io/console/user/settings) - Sign up for RunPod and create
      an API key in your account settings
    - [RunPod Endpoint ID](https://www.runpod.io/console/serverless) - Create a serverless endpoint
      using vLLM with
      [ToolACE-2-Llama-3.1-8B](https://huggingface.co/Team-ACE/ToolACE-2-Llama-3.1-8B) (or any other
      compatible LLM with function calling capabilities) and use its ID

### Installation

1. Navigate to the janitor-agent directory:

    ```bash
    cd packages/janitor-agent
    ```

2. Install dependencies:

    ```bash
    npm install
    ```

3. Set up environment variables:

    ```bash
    cp .env.example .env
    ```

4. Edit the `.env` file and add your API keys + RunPod endpoint configuration

### Development

To start the development server:

```bash
npm run dev
```

This will launch the Mastra development server which allows you to interact with the agents via a
web interface at [http://localhost:4111](http://localhost:4111).

## 🧪 Testing

### Repository Validation

To validate a Docker repository:

```bash
npm run test:janitor:validate
```

This will:

1. Clone the example repository
   ([TimPietrusky/worker-basic](https://github.com/TimPietrusky/worker-basic))
2. Validate the Dockerfile by building and running it
3. Attempt automatic repairs if validation fails
4. Create a PR with fixes (if GitHub token is configured)

### Feature Addition

To test adding features to a repository:

```bash
npm run test:janitor:add-feature
```

This will:

1. Clone the example repository
2. Add the specified feature (e.g., `.runpod` folder, `hub.json`, `tests.json`, README badge)
3. Validate the repository still works after feature addition
4. Create a PR with the new feature (if GitHub token is configured)

## 🛠️ Available Scripts

| Script                             | Description                         |
| ---------------------------------- | ----------------------------------- |
| `npm run dev`                      | Start the Mastra development server |
| `npm run build`                    | Build the TypeScript project        |
| `npm run test:janitor:validate`    | Test repository validation workflow |
| `npm run test:janitor:add-feature` | Test feature addition workflow      |

## 📁 Project Structure

```
packages/janitor-agent/
├── src/
│   ├── mastra/
│   │   ├── agents/           # AI agents (janitor, dev, pr-creator)
│   │   ├── tools/            # Tools for agents (docker, git, file operations)
│   │   ├── workflows/        # Mastra workflows
│   │   └── utils/            # Utility functions
│   └── utils/                # General utilities
├── tests/                    # Test scripts and scenarios
├── repos/                    # Local repository cache
└── scripts/                  # Utility scripts
```

## 🔧 Configuration

### Environment Variables

Create a `.env` file with the following variables:

```env
# Anthropic (required for main agents)
ANTHROPIC_API_KEY=your_anthropic_api_key

# GitHub (required for PR creation)
GITHUB_PERSONAL_ACCESS_TOKEN=your_github_token

# RunPod (optional, for additional LLM options)
RUNPOD_API_KEY=your_runpod_api_key
RUNPOD_ENDPOINT_ID=your_endpoint_id

# Optional: Model provider preferences
MASTRA_MODEL_PROVIDER=anthropic  # or 'runpod'
```

### Agent Capabilities

- **Repository Validation**: Clones repos, builds Docker images, runs containers, checks logs
- **Automatic Repair**: Fixes common Docker, dependency, and configuration issues
- **Feature Addition**: Adds standardized features like RunPod Hub preparation
- **Pull Request Creation**: Automatically creates PRs with fixes and features
- **Smart Change Detection**: Only creates PRs when actual changes are made

## 🤝 Usage Examples

### Basic Repository Validation

```typescript
// The janitor agent can validate any Docker repository
const result = await janitor.generate("Please validate the repository TimPietrusky/worker-basic");
```

### Adding Features

```typescript
// Add RunPod Hub support to a repository
const result = await janitor.generate(`
Add hub preparation feature to TimPietrusky/worker-basic:
- .runpod folder with hub.json and tests.json
- Add RunPod badge to README
`);
```

### Custom Repair Instructions

```typescript
// Provide specific repair guidance
const result = await janitor.generate(`
Validate and fix the repository user/broken-repo. 
Focus on Python dependency issues and Docker layer optimization.
`);
```

## 🐛 Troubleshooting

### Common Issues

1. **Docker not running**: Ensure Docker Desktop is installed and running
2. **API key errors**: Verify all required API keys are set in `.env`
3. **GitHub permission errors**: Ensure GitHub token has `repo` scope
4. **Memory issues**: The agent creates a local database file `mastra.db` for conversation memory

### Debug Mode

Enable detailed logging by setting the log level:

```bash
# In your .env file
MASTRA_LOG_LEVEL=debug
```

## 📝 Contributing

1. Make changes to agents, tools, or workflows
2. Test locally with `npm run dev`
3. Run validation tests with `npm run test:janitor:validate`
4. Submit PR with clear description of changes

## 📄 License

MIT License - see [LICENSE](../../LICENSE) for details.
