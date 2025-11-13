# PRD-to-GitHub Pipeline (p2g-pipeline)

[![Node.js](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

An automated pipeline system that transforms Product Requirements Documents (PRDs) into fully structured GitHub Projects with a three-tier hierarchy: Initiatives (L1 - the WHY), Capabilities (L2 - the WHAT), and Deliverables (L3 - optional sub-issues). The system uses Claude AI to intelligently decompose requirements and automatically creates GitHub repositories, labels, issues with parent-child relationships, and GitHub Projects v2 boards optimized for AI + Human-In-The-Loop (HITL) workflows.

**Built for AI-assisted development with Claude Code** 🤖

## Features

- **PRD Processing**: Parse markdown PRD files and extract project metadata (title, description, tech stack)
- **AI Decomposition**: Use Claude AI to intelligently break down requirements into a three-tier hierarchy:
  - **Initiatives (L1)**: Major outcomes that define WHY (objectives, success metrics, business value)
  - **Capabilities (L2)**: Specific features/systems that define WHAT (scope, contracts, acceptance criteria)
  - **Deliverables (L3)**: Optional sub-issues for complex capabilities requiring review gates or sequencing
- **Two-Phase Decomposition**: Support for large PRDs with initiative-first then capability-per-initiative processing
- **GitHub Integration**: Automatically create repositories, labels, and issues with parent-child relationships
- **Sub-Issues Support**: Native GitHub sub-issue relationships for organizations (with graceful fallback for personal repos)
- **GitHub Projects v2**: Automated project board creation with 9-column AI+HITL workflow
- **Dependency Tracking**: Automatic detection and linking of cross-capability dependencies
- **CLI Interface**: Simple command-line tool with dry-run, verbose logging, and output options

## Prerequisites

- **Node.js**: Version 20 or higher
- **GitHub Account**: With permissions to create repositories and issues
- **Anthropic API Key**: For Claude AI integration

## Installation

### From Source

```bash
# Clone the repository
git clone <your-repo-url>
cd project-pipeline

# Install dependencies
npm install

# Build the project
npm run build

# Link for global use (optional)
npm link
```

## Configuration

### Environment Variables

Create a `.env` file in the project root with your credentials:

```bash
# Required: GitHub Configuration
GITHUB_TOKEN=your_github_personal_access_token_here
GITHUB_OWNER=your_github_username_or_org

# Required: Anthropic Claude API
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Optional: Customize behavior
GITHUB_DEFAULT_LABELS=true
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022
ANTHROPIC_MAX_TOKENS=8000
ANTHROPIC_TEMPERATURE=0.3
```

### Getting API Credentials

#### GitHub Personal Access Token

1. Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Click "Generate new token (classic)"
3. Select required scopes:
   - **Personal repos**: `repo`, `project`, `workflow`
   - **Organization repos**: `repo`, `project`, `read:org` (required for sub-issues)
4. Copy the generated token to your `.env` file

**Note**: For best results (sub-issues support), use an organization repository. Personal repositories do not support the sub-issues feature even with paid GitHub plans.

#### Anthropic API Key

1. Sign up at [console.anthropic.com](https://console.anthropic.com)
2. Navigate to API Keys section
3. Create a new API key
4. Copy the key to your `.env` file

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Set up your .env file (see Configuration section)
cp .env.example .env
# Edit .env with your GitHub token, owner, and Anthropic API key

# 3. Build the project
npm run build

# 4. Try a dry run with the example PRD
node dist/index.js create examples/sample-task-api.md --repo test-project --dry-run

# 5. Create a real project (recommended: use --two-phase for large PRDs)
node dist/index.js create examples/sample-task-api.md --repo my-project --two-phase
```

## Usage

### Basic Usage

```bash
# Create a GitHub project from a PRD file (single-phase)
p2g create examples/sample-task-api.md --repo task-management-api

# RECOMMENDED: Use two-phase for better reliability and large PRDs
p2g create my-prd.md --repo my-project --two-phase

# Dry run (preview structure without creating issues)
p2g create my-prd.md --repo my-project --dry-run

# Save output to JSON file for inspection
p2g create my-prd.md --repo my-project --output structure.json --dry-run

# With verbose logging
p2g create my-prd.md --repo my-project --two-phase --verbose

# Add to existing GitHub Project board
p2g create my-prd.md --repo my-project --project 5

# Skip project board creation (issues only)
p2g create my-prd.md --repo my-project --skip-project
```

### Command Options

```
p2g create <prd-file> [options]

Arguments:
  prd-file                  Path to the PRD markdown file

Options:
  -r, --repo <name>         Repository name to create or use (required)
  -o, --owner <name>        GitHub owner (username or organization)
  -v, --verbose             Enable verbose logging
  --dry-run                 Preview structure without creating GitHub issues
  --two-phase               Use two-phase decomposition (RECOMMENDED for large PRDs)
  --output <file>           Save generated structure to JSON file
  --project <number>        Add issues to existing GitHub Project number
  --skip-project            Skip GitHub Projects creation, only create issues
  -h, --help                Display help for command
```

### Key Features Explained

**Two-Phase Decomposition** (`--two-phase`): Recommended for large PRDs to avoid token limits. Generates initiatives first, then capabilities for each initiative separately. Includes graceful failure handling with partial results saved to `.p2g-partial.json`.

**Dry Run** (`--dry-run`): Preview the generated structure (initiatives, capabilities, deliverables) without making any GitHub API calls.

**Output File** (`--output`): Save the complete project structure as JSON for inspection or later use.

## Writing PRDs

Your PRD should be a markdown file with clear sections. Here's a recommended structure:

```markdown
# Project Title

## Overview
Brief description of what you're building

## Tech Stack
- Frontend: React, TypeScript
- Backend: Node.js, Express
- Database: PostgreSQL

## Features

### Feature 1
Description of the feature and requirements

### Feature 2
Description of the feature and requirements
```

See `examples/sample-task-api.md` for a complete example.

## Project Structure

```
p2g-pipeline/
├── src/
│   ├── cli/                      # CLI interface layer
│   │   ├── index.ts              # CLI program setup
│   │   └── commands/
│   │       ├── create.ts         # Main 'create' command (pipeline orchestration)
│   │       └── apply.ts          # Apply command (future)
│   ├── core/                     # Core business logic
│   │   ├── prdProcessor.ts       # PRD parsing and metadata extraction
│   │   └── aiDecomposer.ts       # Claude API client with single/two-phase decomposition
│   ├── github/                   # GitHub API integration layer
│   │   ├── repoManager.ts        # Repository creation/retrieval (org detection)
│   │   ├── labelManager.ts       # Label setup and management
│   │   ├── issueGenerator.ts     # Four-pass issue creation with sub-issues
│   │   └── projectManager.ts     # GitHub Projects v2 integration
│   ├── types/                    # TypeScript types and schemas
│   │   ├── index.ts              # Core interfaces (Initiative, Capability, etc.)
│   │   └── schemas.ts            # Zod validation schemas
│   └── utils/                    # Utility functions
│       ├── config.ts             # Environment config loading
│       └── logger.ts             # Logging utilities
├── tests/                        # Test files (Jest)
│   ├── unit/                     # Unit tests
│   ├── integration/              # Integration tests
│   └── fixtures/                 # Test data
├── examples/                     # Example PRD files
│   └── sample-task-api.md        # Sample PRD for testing
├── dist/                         # Compiled TypeScript output
└── docs/                         # Documentation (if any)
```

### Key Files

- **src/cli/commands/create.ts** - Main entry point; orchestrates the 6-stage pipeline
- **src/core/aiDecomposer.ts** - Contains prompt engineering and Claude API integration
- **src/github/issueGenerator.ts** - Four-pass issue creation with parent-child relationships
- **src/types/schemas.ts** - Zod schemas for runtime validation of AI responses
- **CLAUDE.md** - Comprehensive guide for Claude Code when working in this repository

## Development

### Build

```bash
npm run build
```

### Run in Development Mode

```bash
npm run dev -- create examples/sample-task-api.md --repo test-project --dry-run
```

### Run Tests

```bash
npm test

# Watch mode
npm run test:watch
```

### Lint

```bash
npm run lint
```

## How It Works

1. **PRD Processing**: The tool reads and parses your markdown PRD file, extracting project metadata like title, description, and tech stack.

2. **AI Decomposition**: Claude AI analyzes the PRD and breaks it down into a three-tier hierarchy:
   - **Initiatives (L1)**: 3-6 major outcomes that define WHY (objectives, success metrics, business value)
   - **Capabilities (L2)**: 3-8 features/systems per initiative that define WHAT (scope boundaries, input/output contracts, acceptance criteria)
   - **Deliverables (L3)**: Optional sub-issues for complex capabilities requiring review gates or sequencing
   - **Dependencies**: Automatic detection of dependencies between capabilities
   - **AI Context**: High-level guidance for implementation (domain patterns, not file paths)

3. **GitHub Setup**: The tool:
   - Creates or connects to a GitHub repository (detects org vs personal account automatically)
   - Sets up standard labels (type:initiative, type:capability, type:deliverable, complexity levels, initiative IDs)
   - Creates GitHub issues in four passes with parent-child relationships:
     1. Initiative issues (L1 parents)
     2. Capability issues (L2 children of initiatives)
     3. Deliverable issues (L3 children of capabilities, if needed)
     4. Dependency updates with issue number links
   - Creates GitHub Projects v2 board with 9-column AI+HITL workflow (Backlog → Ready for AI → AI: Planning & Scaffold → AI: Implementation → Awaiting Review (HITL) → Changes Requested → Ready to Merge → Merged/Verification → Done)

4. **Result**: You get a fully populated GitHub repository with organized issues, proper parent-child relationships, and a project board ready for AI-assisted development with Claude Code.

## Roadmap

### Phase 1: Core Pipeline ✅ (Complete)
- ✅ PRD processing with metadata extraction
- ✅ Claude API integration with single-phase decomposition
- ✅ Three-tier hierarchy (Initiatives, Capabilities, Deliverables)
- ✅ GitHub repository creation (org and personal account support)
- ✅ GitHub issue creation with labels
- ✅ CLI interface with dry-run mode

### Phase 2: Advanced Features ✅ (Complete)
- ✅ Two-phase decomposition for large PRDs
- ✅ Dependency tracking and linking
- ✅ Parent-child issue relationships (sub-issues)
- ✅ GitHub Projects v2 integration with AI+HITL workflow
- ✅ Graceful failure handling with partial results
- ✅ Token limit detection and actionable error messages
- ✅ Output to JSON file for inspection

### Phase 3: Enhancements (Planned)
- ⬜ Repository scaffolding with initial files based on tech stack
- ⬜ Interactive review mode before creating issues
- ⬜ Template system for common project types (web apps, APIs, mobile, etc.)
- ⬜ Configuration file support (.p2grc)
- ⬜ Resume capability for interrupted processes
- ⬜ Dependency graph visualization

### Phase 4: Advanced (Future)
- ⬜ Web dashboard for monitoring pipeline runs
- ⬜ Webhook integrations for automated triggers
- ⬜ Team collaboration features and multi-user support
- ⬜ PRD version tracking and incremental updates
- ⬜ Integration with other project management tools

## Troubleshooting

### "Configuration validation failed"

Make sure your `.env` file exists and contains all required variables:
- `GITHUB_TOKEN`
- `GITHUB_OWNER`
- `ANTHROPIC_API_KEY`

### "Failed to create repository"

- Check that your GitHub token has the correct permissions (`repo`, `project`, `workflow`)
- For organization repos, ensure you have `read:org` scope
- Verify the repository name is not already taken
- Ensure the owner name matches your GitHub username or organization

### "AI response was truncated due to insufficient output token limit"

This means your PRD is too large for single-phase decomposition:
1. **Use `--two-phase` flag** (recommended) - breaks decomposition into smaller chunks
2. Increase `ANTHROPIC_MAX_TOKENS` in `.env` (e.g., 8192 or 16384)
3. Simplify your PRD or split it into smaller documents

### Parent-child relationships not working in GitHub Projects

If capabilities show "No parent issue" when grouping by parent:
1. **Enable sub-issues in your repository**: Go to Repository → Settings → Features → Enable "Sub-issues"
2. **Use an organization repository**: Sub-issues are NOT available for personal repositories (even with paid plans)
3. **Verify token permissions**: Token must have `repo`, `project`, and `read:org` scopes
4. Re-run the pipeline after enabling sub-issues

**Note**: If sub-issues aren't enabled, the tool falls back to labels (`parent:#<number>`) and body text, but these won't work with GitHub Projects "Group by Parent Issue" feature.

### Partial success in two-phase mode

If some initiatives fail during two-phase decomposition:
- The tool continues with successful initiatives
- Partial results are saved to `.p2g-partial.json`
- Check the file for details on which initiatives failed and why
- Only successful initiatives will have issues created

### "Claude API error"

- Verify your Anthropic API key is correct
- Check that you have sufficient API credits
- Ensure you're not hitting rate limits
- For connection errors, check your network/firewall settings

## Key Concepts

### Three-Tier Hierarchy

The system organizes work into three levels inspired by knowledge graph principles:

- **L1 - Initiatives**: Answer WHY we're building this (objectives, success metrics, business value). Think of these as major outcomes or milestones.
- **L2 - Capabilities**: Answer WHAT needs to exist (scope boundaries, input/output contracts, acceptance criteria). These are specific features or systems.
- **L3 - Deliverables**: Optional sub-issues for complex capabilities that require review gates or sequential delivery.

### AI-First Design Philosophy

The prompts are carefully designed to focus on WHAT and WHY, not HOW:
- No file paths or implementation steps in issue descriptions
- Focus on outcome-based acceptance criteria
- High-level AI context provides domain guidance, not code snippets
- Capabilities define contracts and boundaries, letting AI decide implementation details

### GitHub Projects v2 AI+HITL Workflow

The automated 9-column workflow supports collaboration between AI agents and humans:
1. **Backlog** - New issues start here
2. **Ready for AI** - Issues ready for AI implementation
3. **AI: Planning & Scaffold** - AI generating architecture
4. **AI: Implementation** - AI actively coding
5. **Awaiting Review (HITL)** - Human review checkpoint
6. **Changes Requested** - Revisions needed
7. **Ready to Merge** - Approved and ready
8. **Merged/Verification** - Testing in environment
9. **Done** - Complete and verified

## Contributing

Contributions are welcome! The project is actively maintained and has completed Phase 1 and Phase 2 features.

## License

MIT

## Support and Documentation

For issues and questions:
- **Report bugs**: Create an issue on GitHub
- **Troubleshooting**: See the [Troubleshooting](#troubleshooting) section above
- **Architecture details**: See [CLAUDE.md](./CLAUDE.md) for comprehensive technical documentation
- **Example PRDs**: Check the `examples/` directory for reference PRDs
- **Development guide**: See the [Development](#development) section for building and testing

## Related Resources

- [Claude AI](https://claude.ai/) - The AI powering intelligent PRD decomposition
- [Claude Code](https://claude.ai/code) - AI-assisted development tool this pipeline is optimized for
- [GitHub Projects v2](https://docs.github.com/en/issues/planning-and-tracking-with-projects/learning-about-projects/about-projects) - Documentation for GitHub's project management features
- [GitHub Sub-Issues](https://github.blog/changelog/2023-09-21-github-issues-sub-issues-beta/) - Beta feature for parent-child issue relationships
