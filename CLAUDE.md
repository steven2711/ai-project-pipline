# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PRD-to-GitHub Pipeline (p2g-pipeline) is an automated system that transforms Product Requirements Documents (PRDs) into fully structured GitHub Projects with a three-tier hierarchy. It uses Claude AI to intelligently decompose PRDs into Initiatives (L1, the WHY), Capabilities (L2, the WHAT), and optionally Deliverables (L3, sub-issues for complex capabilities). The system automatically creates GitHub repositories, labels, and issues with proper structure, dependencies, and GitHub Projects v2 integration.

**Tech Stack:** TypeScript, Node.js, Anthropic SDK, Octokit (GitHub API + GraphQL), Commander (CLI)

**Key Terminology:**
- **Initiative (L1)**: Major outcome or goal that answers WHY we're building this (formerly "epic")
- **Capability (L2)**: Specific feature or system that defines WHAT needs to exist (formerly "story")
- **Deliverable (L3)**: Optional sub-issues for complex capabilities requiring review gates or sequencing
- **Tasks**: Simple checklist items within capabilities that don't require sub-issues

## Development Commands

### Building and Running
```bash
npm run build          # Compile TypeScript to dist/
npm run dev -- create examples/sample-task-api.md --repo test-project --dry-run
npm run clean          # Remove dist/ directory
```

### Testing
```bash
npm test               # Run all tests with Jest
npm run test:watch     # Run tests in watch mode
```

### Linting
```bash
npm run lint           # Run ESLint on src/**/*.ts
```

### Running the CLI Tool
```bash
# After building
node dist/index.js create <prd-file> --repo <repo-name> [options]

# Or use the dev script (recommended for development)
npm run dev -- create <prd-file> --repo <repo-name> [options]

# Important options:
--two-phase              # Use two-phase decomposition (RECOMMENDED for large PRDs to avoid token limits)
--dry-run                # Preview structure without creating GitHub issues
--output <file>          # Save generated structure to JSON file for inspection
--skip-project           # Skip GitHub Projects creation, only create issues
--project <number>       # Add issues to existing GitHub Project number
```

## Architecture

### Pipeline Flow
The application follows a sequential pipeline architecture with six main stages:

1. **PRD Processing** (`src/core/prdProcessor.ts`): Reads and parses markdown PRD files, extracting metadata (title, description, tech stack)
2. **AI Decomposition** (`src/core/aiDecomposer.ts`): Sends PRD to Claude API to break it down into a three-tier hierarchy with dependencies
   - Single-phase: `decompose()` - generates full structure in one API call
   - Two-phase: `decomposeInitiatives()` → `decomposeInitiativeCapabilities()` - generates initiatives first, then capabilities per initiative (recommended for large PRDs to avoid token limits)
3. **Repository Management** (`src/github/repoManager.ts`): Creates or connects to GitHub repositories
4. **Label Management** (`src/github/labelManager.ts`): Sets up standard GitHub labels (type:initiative, type:capability, type:deliverable, complexity levels, initiative IDs)
5. **Issue Generation** (`src/github/issueGenerator.ts`): Creates GitHub issues in four passes with parent-child relationships
6. **Project Management** (`src/github/projectManager.ts`): Creates or updates GitHub Projects v2 board and adds all issues

### Core Components

**CLI Layer** (`src/cli/`): Commander-based CLI interface that orchestrates the pipeline. The `create` command (`src/cli/commands/create.ts`) is the main entry point with comprehensive error handling.

**Core Layer** (`src/core/`):
- `prdProcessor.ts`: Markdown parser that extracts structured metadata using regex patterns. Validates file size (100-100,000 chars) and extracts title (H1 or "Project Name"), description (Overview/Description sections), and tech stack (categorized by frontend/backend/database/testing/deployment).
- `aiDecomposer.ts`: Claude API client with three decomposition methods:
  - `decompose()`: Single-phase full decomposition
  - `decomposeInitiatives()`: Phase 1 of two-phase (generates L1 initiatives)
  - `decomposeInitiativeCapabilities()`: Phase 2 of two-phase (generates L2 capabilities for one initiative)
  - Returns validated JSON matching `ProjectStructureSchema`. Uses Zod for runtime validation.
  - Detects token limit truncation and provides actionable error messages.

**GitHub Layer** (`src/github/`):
- `repoManager.ts`: Handles repository creation/retrieval via Octokit REST API. Automatically detects if owner is an organization and uses appropriate API (`createInOrg` for orgs, `createForAuthenticatedUser` for personal accounts)
- `labelManager.ts`: Ensures standard labels exist on the repository (type:initiative, type:capability, type:deliverable, initiative IDs, complexity)
- `issueGenerator.ts`: Four-pass issue creation with parent-child relationships using GitHub GraphQL API:
  1. Create L1 initiative issues (parent issues)
  2. Create L2 capability issues as sub-issues of initiatives
  3. Create L3 deliverable issues as sub-issues of capabilities (if `shouldCreateSubIssues: true`)
  4. Update all issues with dependency comments linking to issue numbers
- `projectManager.ts`: GitHub Projects v2 integration for board management

**Types** (`src/types/`):
- `index.ts`: Core TypeScript interfaces (ProjectStructure, Initiative, Capability, Deliverable, Config, etc.)
- `schemas.ts`: Zod schemas for runtime validation of AI responses with backward compatibility for legacy naming (Epic/Story → Initiative/Capability)

### Key Design Patterns

**Rate Limiting**: Uses 1-second delays between GitHub issue creation calls to avoid rate limits (see `issueGenerator.ts`).

**Error Handling**: Custom error classes (e.g., `PRDProcessorError`, `AIDecomposerError`, `IssueGeneratorError`) extend Error with specific names for better error tracking. The two-phase decomposition has graceful failure handling: if some initiatives fail, it continues with successful ones and saves partial results to `.p2g-partial.json`.

**Configuration**: Environment-based config loaded via `src/utils/config.ts` from `.env` file. Required: `GITHUB_TOKEN`, `GITHUB_OWNER`, `ANTHROPIC_API_KEY`. Optional: `ANTHROPIC_MODEL` (default: claude-3-5-sonnet-20241022), `ANTHROPIC_MAX_TOKENS` (default: 8192), `ANTHROPIC_TEMPERATURE` (default: 0.3), `GITHUB_PROJECT_NUMBER`.

**Dependency Tracking**: Capabilities and deliverables reference other IDs in their `dependencies` arrays. IssueGenerator maintains three separate maps (`capabilityIdToIssueNumber`, `initiativeIdToIssueNumber`, `deliverableIdToIssueNumber`) to resolve these during issue creation, then adds dependency comments in the fourth pass.

**Parent-Child Issue Relationships**: Uses GitHub REST API to set parent-child relationships between issues (initiatives → capabilities → deliverables). Requires repository to have sub-issues enabled (Settings → Features → Sub-issues). Falls back gracefully to labels and body text if repository doesn't support sub-issues or has permission issues.

**GitHub Projects v2 Workflow**: When creating a new project, the tool automatically creates a Status field with 9 workflow columns optimized for AI + Human-In-The-Loop (HITL) collaboration:

1. **Backlog** (Gray) - New issues automatically start here
2. **Ready for AI** (Green) - Issues ready for AI agent to pick up
3. **AI: Planning & Scaffold** (Yellow) - AI generating structure and approach
4. **AI: Implementation** (Orange) - AI actively implementing the capability
5. **Awaiting Review (HITL)** (Red) - Human review checkpoint for AI work
6. **Changes Requested** (Purple) - Issues requiring revisions after review
7. **Ready to Merge** (Pink) - Approved changes ready for merge
8. **Merged / Verification** (Blue) - Changes merged, verifying in environment
9. **Done** (Green) - Fully completed and verified

This workflow enables systematic handoffs between AI agents and human reviewers, with clear review gates at key milestones. Issues can be manually moved between columns as they progress through the pipeline.

## Important Implementation Details

### AI Prompt Structure
The prompts in `aiDecomposer.ts` are carefully structured to return valid JSON and focus on WHAT and WHY, not HOW:

**Single-Phase Prompt** (`buildPrompt()`): Instructs Claude to generate the full three-tier structure in one call:
- Create 3-6 initiatives (L1) that define WHY (objectives, success metrics, business value)
- Break initiatives into 3-8 capabilities (L2) that define WHAT (scope boundaries, input/output contracts, acceptance criteria)
- For complex capabilities, create deliverables (L3) when `shouldCreateSubIssues: true`
- Otherwise, include simple checklist tasks within capabilities
- Generate IDs in format: `initiative-{number}`, `capability-{initiative}-{number}`, `deliverable-{initiative}-{capability}-{number}`, `task-{initiative}-{capability}-{number}`
- **Critical**: DO NOT specify file paths or implementation details - focus on outcomes and contracts

**Two-Phase Prompts**:
- `buildInitiativesPrompt()`: Phase 1 - generates only initiatives (L1) with objectives and success metrics
- `buildCapabilitiesPrompt()`: Phase 2 - generates capabilities (L2) for a specific initiative, with full PRD context and cross-initiative dependency awareness

**Key Prompt Principles**:
- Focus on WHAT needs to exist and WHY, not HOW to implement
- Define input/output contracts and acceptance criteria (outcome-focused)
- Avoid prescribing file paths, code patterns, or implementation steps
- Set `shouldCreateSubIssues: true` only for capabilities requiring review gates or complex sequencing
- Keep `aiContext` high-level (domain patterns, not implementation details)

### Issue Body Formats
Issues created by `issueGenerator.ts` have three distinct formats:

**Initiative Issues** (`createInitiativeIssue()`):
- Objective (WHY)
- Description
- Success metrics
- Summary of contained capabilities and deliverables
- Metadata footer with initiative ID and priority

**Capability Issues** (`createCapabilityIssue()` → `formatCapabilityBody()`):
- Parent initiative reference
- Description (WHAT)
- Input/output contract
- Acceptance criteria (observable outcomes, checkboxes)
- Edge constraints
- Implementation checklist (if no deliverables)
- AI implementation context (high-level guidance)
- Metadata footer with capability ID, estimated hours, complexity

**Deliverable Issues** (`createDeliverableIssue()` → `formatDeliverableBody()`):
- Parent capability reference
- Description
- Completion criteria (checkboxes)
- Review gate warning (if required)
- Metadata footer with deliverable ID

### Testing Strategy
- Tests located in `tests/` directory (excluded from TypeScript compilation)
- Jest configured with ts-jest preset
- Test structure: `tests/unit/` for unit tests, `tests/integration/` for integration tests, `tests/fixtures/` for test data
- Coverage collected from `src/**/*.ts` (excluding .d.ts and index.ts)

## Configuration Files

**tsconfig.json**: Target ES2022, outputs to `dist/` with source maps and declarations. Strict mode enabled.

**jest.config.js**: ts-jest preset, tests in `tests/` directory, transforms ES modules (chalk, ora, inquirer) to CommonJS.

**package.json**: Main entry is `dist/index.js`, binary command is `p2g`. Requires Node.js >= 20.

## Environment Setup

Required `.env` variables:
```bash
GITHUB_TOKEN=<github_personal_access_token>
GITHUB_OWNER=<github_username_or_org>
ANTHROPIC_API_KEY=<anthropic_api_key>
```

Optional `.env` variables:
```bash
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022           # Claude model to use
ANTHROPIC_MAX_TOKENS=8192                            # Output token limit (increase for large PRDs)
ANTHROPIC_TEMPERATURE=0.3                            # Response randomness (0-1)
GITHUB_PROJECT_NUMBER=123                            # Existing project number to add issues to
GITHUB_DEFAULT_LABELS=true                           # Whether to create default labels
```

**GitHub token scopes:**
- For personal repositories: `repo`, `project`, `workflow`
- For organization repositories: `repo`, `project`, `read:org` (required for sub-issues and org access)

## Organization vs Personal Repository Setup

**Sub-Issues Feature Availability:**
- ✅ **Organization repositories**: Sub-issues are available (must be enabled per-repo)
- ❌ **Personal repositories**: Sub-issues are NOT available (even with paid GitHub plans)

**Setting up for Organizations:**

1. **Create a GitHub organization** (if you don't have one):
   - Free organizations are available at https://github.com/organizations/new
   - Even a single-person organization can access sub-issues

2. **Update your `.env` file**:
   ```bash
   GITHUB_OWNER=your-org-name  # Change from personal username to org name
   ```

3. **Ensure token has correct scopes**:
   - Generate a new token with `repo`, `project`, and `read:org` scopes
   - Update `GITHUB_TOKEN` in `.env`

4. **Create repositories**:
   - The tool now automatically detects if owner is an organization
   - Uses `createInOrg()` for organizations, `createForAuthenticatedUser()` for personal accounts
   - Repositories are created in the correct location automatically

5. **Enable sub-issues per repository**:
   - After repository creation, go to: Repository → Settings → Features
   - Enable "Sub-issues" checkbox (this is a beta feature)
   - Re-run the pipeline for that repository to create proper parent-child relationships

**Default Organization Labels:**
- Organizations come with default issue types and labels
- The p2g-pipeline labels will coexist peacefully with org defaults
- The tool checks for existing labels before creating and skips duplicates

## Common Troubleshooting

**Token Limit Errors**: If you see "AI response was truncated due to insufficient output token limit":
1. Use `--two-phase` flag (recommended for large PRDs)
2. Increase `ANTHROPIC_MAX_TOKENS` in `.env` (e.g., 8192 or 16384)
3. Simplify your PRD or split into smaller documents

**Partial Success in Two-Phase Mode**: If some initiatives fail during two-phase decomposition, the tool will:
- Continue processing remaining initiatives
- Save partial results to `.p2g-partial.json`
- Report which initiatives failed and why
- Create issues for successful initiatives only

**Parent Issue Grouping Not Working**: If capabilities show "No parent issue" when grouping by parent in GitHub Projects:

1. **Enable sub-issues in your repository**:
   - Go to Repository → Settings → Features
   - Enable "Sub-issues" (this is a beta feature)
   - Re-run the pipeline to create issues with proper parent-child relationships

2. **Verify token permissions**:
   - Your `GITHUB_TOKEN` must have `repo`, `project`, and `read:org` (for org repos) scopes
   - Regenerate your token if needed with these scopes

3. **Understanding the fallback strategy**:
   - If sub-issues aren't enabled or permissions are insufficient, the tool falls back to:
     - Creating `parent:#<number>` labels on child issues
     - Adding "Parent Issue: #<number>" text in issue bodies
   - **Important**: These fallbacks do NOT work with GitHub Projects "Group by Parent Issue" feature
   - The fallbacks are visible aids only; actual sub-issue relationships require the `addSubIssue` API

4. **GraphQL Mutation Used**:
   ```graphql
   mutation($issueId: ID!, $subIssueId: ID!) {
     addSubIssue(input: {
       issueId: $issueId,        # Parent issue node ID
       subIssueId: $subIssueId   # Child issue node ID
     }) {
       issue {
         id
       }
       subIssue {
         id
       }
     }
   }
   ```

   **Important**: This mutation requires the `GraphQL-Features: sub_issues` header to be set in API requests.

**GraphQL Sub-Issue Errors**: If you see warnings about sub-issue creation failures:
- "Repository doesn't support sub-issues feature" → Enable in Settings → Features → Sub-issues
- "Insufficient permissions" → Ensure your GitHub token has `repo`, `project`, and `read:org` scopes
- Tool will automatically fall back to labels/body text but Projects grouping won't work
