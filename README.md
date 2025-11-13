# PRD-to-GitHub Pipeline (p2g-pipeline)

An automated pipeline system that transforms Product Requirements Documents (PRDs) into fully structured GitHub Projects with epics, tasks, and dependencies, enabling AI-driven development workflows with Claude Code.

## Features

- **PRD Processing**: Parse markdown PRD files and extract project metadata
- **AI Decomposition**: Use Claude AI to intelligently break down requirements into epics and tasks
- **GitHub Integration**: Automatically create repositories, labels, and issues
- **Task Management**: Generate AI-implementable tasks with clear context and dependencies
- **CLI Interface**: Simple command-line tool for easy automation

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
3. Select scopes: `repo`, `project`, `workflow`
4. Copy the generated token to your `.env` file

#### Anthropic API Key

1. Sign up at [console.anthropic.com](https://console.anthropic.com)
2. Navigate to API Keys section
3. Create a new API key
4. Copy the key to your `.env` file

## Usage

### Basic Usage

```bash
# Create a GitHub project from a PRD file
p2g create examples/sample-task-api.md --repo task-management-api

# With verbose output
p2g create my-prd.md --repo my-project --verbose

# Dry run (preview without creating)
p2g create my-prd.md --repo my-project --dry-run
```

### Command Options

```
p2g create <prd-file> [options]

Arguments:
  prd-file              Path to the PRD markdown file

Options:
  -r, --repo <name>     Repository name to create or use (required)
  -o, --owner <name>    GitHub owner (username or organization)
  -v, --verbose         Enable verbose logging
  --dry-run             Preview without creating issues
  -h, --help            Display help for command
```

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
│   ├── core/              # Core business logic
│   │   ├── prdProcessor.ts
│   │   └── aiDecomposer.ts
│   ├── github/            # GitHub API integration
│   │   ├── repoManager.ts
│   │   ├── labelManager.ts
│   │   └── issueGenerator.ts
│   ├── cli/               # CLI interface
│   │   └── commands/
│   ├── types/             # TypeScript types
│   └── utils/             # Utilities
├── tests/                 # Test files
├── examples/              # Example PRDs
└── docs/                  # Documentation
```

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

2. **AI Decomposition**: Claude AI analyzes the PRD and breaks it down into:
   - Logical epics (feature groupings)
   - Granular tasks (2-4 hour chunks)
   - Dependencies between tasks
   - Technical implementation notes
   - AI-specific context for implementation

3. **GitHub Setup**: The tool:
   - Creates or connects to a GitHub repository
   - Sets up standard labels (feature, bug, epic, ai-ready, etc.)
   - Creates GitHub issues for each task with detailed descriptions

4. **Result**: You get a fully populated GitHub repository with organized issues ready for AI-assisted development with Claude Code.

## Roadmap

### Phase 1: MVP (Current)
- ✅ Basic PRD processing
- ✅ Claude API integration
- ✅ GitHub issue creation
- ✅ Simple CLI interface

### Phase 2: Enhancement (Planned)
- ⬜ Dependency management and visualization
- ⬜ Repository scaffolding with initial files
- ⬜ Interactive review mode
- ⬜ GitHub Projects v2 integration

### Phase 3: Polish (Future)
- ⬜ Template system for common project types
- ⬜ Configuration file support (.p2grc)
- ⬜ Resume capability for interrupted processes

### Phase 4: Advanced (Future)
- ⬜ Web dashboard for monitoring
- ⬜ Webhook integrations
- ⬜ Team collaboration features

## Troubleshooting

### "Configuration validation failed"

Make sure your `.env` file exists and contains all required variables:
- `GITHUB_TOKEN`
- `GITHUB_OWNER`
- `ANTHROPIC_API_KEY`

### "Failed to create repository"

- Check that your GitHub token has the correct permissions (repo scope)
- Verify the repository name is not already taken
- Ensure the owner name matches your GitHub username

### "Claude API error"

- Verify your Anthropic API key is correct
- Check that you have sufficient API credits
- Ensure you're not hitting rate limits

## Contributing

Contributions are welcome! This is Phase 1 MVP, and there's lots of room for improvement.

## License

MIT

## Support

For issues and questions:
- Create an issue on GitHub
- Review the troubleshooting section
- Check the examples directory for reference PRDs

---

**Built for AI-assisted development with Claude Code**
