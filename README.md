# janitor

> automatically maintain docker repositories with agents

![janitor diagram](docs/20250327_janitor_diagram.png)


Janitor uses a multi-agent architecture (based on [mastra](https://mastra.ai)) to validate and repair Docker repositories:

1. **Janitor** (agent) - Coordinates the whole process
2. **Docker Validation** (workflow) - Tests Docker builds and container execution
3. **Dev** (agent) - Diagnoses and repairs issues in Docker repositories
4. **PR Creator** (agent) - Creates pull requests with fixes on GitHub

## Getting Started

This guide will help you set up and run Janitor locally for maintaining and validating Docker repositories.

### Prerequisites

- Node.js (v22 or later)
- npm
- Docker Desktop installed and running
- API keys:
  - [Anthropic API key](https://console.anthropic.com/settings/keys) - Create an account and get your API key from the console
  - [GitHub Personal Access Token](https://github.com/settings/tokens) - Create a token with `repo` scope
  - [RunPod API key](https://www.runpod.io/console/user/settings) - Sign up for RunPod and create an API key in your account settings
  - [RunPod Endpoint ID](https://www.runpod.io/console/serverless) - Create a serverless endpoint using vLLM with [ToolACE-2-Llama-3.1-8B](https://huggingface.co/Team-ACE/ToolACE-2-Llama-3.1-8B) (or any other compatible llm with function calling capabilities)  and use its ID

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/runpod/janitor.git
   cd janitor
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env
   ```

4. Edit the `.env` file and add your API keys:
   ```
   ANTHROPIC_API_KEY=sk-***************************
   GITHUB_PERSONAL_ACCESS_TOKEN=ghp_***************************
   RUNPOD_API_KEY=rpa_***************************
   
   RUNPOD_ENDPOINT_ID=***************************
   RUNPOD_MODEL_NAME=Team-ACE/ToolACE-2-Llama-3.1-8B
   ```

### Development

To start the development server:

```bash
npm run dev
```

This will launch the Mastra development server which allows you to interact with the agents via a web interface.


### Testing Janitor

To validate a Docker repository:

```bash
npm run test:janitor

This will:
1. Clone the example repository ([TimPietrusky/worker-basic](https://github.com/TimPietrusky/worker-basic))
2. Validate the Dockerfile
3. Attempt repairs if needed
4. Create a PR with fixes (if GitHub token is configured)
```

