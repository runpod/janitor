# Adding Features to Repositories

## User Story

As a repository maintainer, I want to add standardized features to repositories using our existing
agent system, so that I can efficiently implement consistent infrastructure and functionality across
multiple worker repositories.

## Epic

This user story is part of the "RunPod Worker Repository Auto Maintenance" epic, which aims to
create automated tools for maintaining and validating RunPod worker repositories.

## Description

Extend the existing system to:

1. Enable the Janitor to handle prompts for adding features to repositories in addition to
   validation
2. Allow users to specify what features should be added to repositories through natural language
   commands
3. Use the Dev agent to implement the features by adding files, creating directories, and modifying
   existing content
4. Use the PR Creator agent to submit the feature implementations through pull requests
5. Implement a workflow that validates repositories after feature addition to ensure they still
   function correctly

The feature addition capabilities should support:

- Adding standardized files to specific folders in the repository
- Creating necessary directories if they don't exist
- Modifying existing files (like adding badges to README files)
- Customizing configuration files based on repository-specific parameters

## Acceptance Criteria

- Users can request the Janitor to add features to a repository through natural language commands
- The system supports specific feature requests like "prepare the repo for the hub" which adds
  RunPod Hub support
- The Dev agent has the capability to create directories, create new files, and modify existing
  files
- The system can interpret structured content specifications in the user's request (like JSON
  examples)
- The Janitor coordinates the entire feature addition process:
    - Repository checkout
    - Feature implementation through the Dev agent
    - Validation to ensure the repository still works
    - PR creation through the PR Creator agent
- The feature addition process produces a report detailing:
    - What files were added or modified
    - What directories were created
    - What changes were made to existing files
    - Any issues encountered
- The existing validation workflow continues to function properly
- The system gracefully handles errors during the feature addition process

## Technical Notes

- Implement general-purpose file system tools that can be used for multiple purposes. Specifically:
    - A tool to create directories (`create_directory`) is needed for features requiring new folders
      (like `.runpod`).
    - Existing tools `read_file` and `edit_file` will be used for file operations.
    - **Modification Strategy**: To modify existing files (e.g., adding a badge to a README), the
      Dev agent will be responsible for:
        1. Reading the file content using `read_file`.
        2. Identifying the insertion/modification point within the content.
        3. Constructing the new, complete file content with the changes applied.
        4. Writing the entire new content back using `edit_file` (overwriting the original). This
           approach relies on the agent's capability rather than a specialized file modification
           tool.
- Follow existing project conventions for tool implementation and agent communication
- Maintain the current agent structure:
    - Janitor as the orchestrator
    - Dev for technical operations
    - PR Creator for GitHub interactions
- Extend agent instructions to recognize feature addition commands
- Implement appropriate error handling and reporting
- Create tests that verify the feature addition functionality

## Feature Example: Hub Preparation

A user should be able to prompt:

```
add a new feature: prepare the repo for the hub by adding:
- .runpod folder in the root
- hub.json (see example below)
- test.json (see example below)
- add a badge to the readme after the headline in this format: [![RunPod](https://api.runpod.io/badge/runpod-workers/worker-template)](https://www.runpod.io/console/hub/runpod-workers/worker-template) and replace "worker-template" with the name of the repo

## hub.json

{
  "title": "Worker Template",
  "description": "An example description",
  "type": "serverless",
  "category": "audio",
  "iconUrl": "https://example.com/icon.png",
  "config": {
    "runsOn": "GPU",
    "containerDiskInGb": 20,
    "presets": [
      {
        "name": "Preset 1",
        "defaults": {
          "STATIC_1": "value_1",
          "STRING_1": "default value 1"
        }
      }
    ],
    "env": [
      {
        "key": "STATIC_VAR",
        "value": "static_value"
      },
      {
        "key": "STRING_VAR",
        "input": {
          "name": "String Input",
          "type": "string",
          "description": "A string input test",
          "default": "new default value"
        }
      }
    ]
  }
}

## tests.json

{
  "tests": [
    {
      "name": "validation_text_input",
      "input": {
        "text": "Hello world",
        "language": "en"
      },
      "timeout": 10000
    }
  ],
  "config": {
    "gpuTypeId": "NVIDIA GeForce RTX 4090",
    "gpuCount": 1,
    "env": [
      {
        "key": "ENV_KEY_HERE",
        "value": "ENV_VALUE_HERE"
      }
    ],
    "allowedCudaVersions": [
      "12.7",
      "12.6",
      "12.5",
      "12.4",
      "12.3",
      "12.2",
      "12.1",
      "12.0"
    ]
  }
}
```
