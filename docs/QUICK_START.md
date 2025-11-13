# Quick Start Guide

Get up and running with PRD-to-GitHub Pipeline in 5 minutes.

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Configure Environment

Copy the example environment file and fill in your credentials:

```bash
cp .env.example .env
```

Edit `.env` and add:
- Your GitHub Personal Access Token (with `repo` scope)
- Your GitHub username
- Your Anthropic API key

```env
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
GITHUB_OWNER=yourusername
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxx
```

## Step 3: Build the Project

```bash
npm run build
```

## Step 4: Test with Example PRD

Run a dry-run to see what would be created:

```bash
node dist/index.js create examples/sample-task-api.md --repo test-task-api --dry-run
```

You should see output showing:
- PRD processing
- AI decomposition results
- Preview of epics and tasks that would be created

## Step 5: Create Your First Project

Remove `--dry-run` to actually create the GitHub repository and issues:

```bash
node dist/index.js create examples/sample-task-api.md --repo test-task-api
```

This will:
1. Create (or connect to) a GitHub repository
2. Set up labels
3. Create GitHub issues for all tasks
4. Show you the repository URL

## Step 6: View Your Project

Visit the repository URL shown in the output to see all your generated issues!

## Troubleshooting

### Missing dependencies

```bash
npm install
```

### Build errors

```bash
npm run clean
npm run build
```

### Configuration errors

Check that your `.env` file has all three required variables:
- `GITHUB_TOKEN`
- `GITHUB_OWNER`
- `ANTHROPIC_API_KEY`

### Permission errors

Make sure your GitHub token has the `repo` scope enabled.

## Next Steps

1. **Write your own PRD**: Create a markdown file describing your project
2. **Run the pipeline**: Use `p2g create your-prd.md --repo your-project`
3. **Start developing**: Use Claude Code with the generated issues

## Tips

- Use `--verbose` flag for detailed logging
- Use `--dry-run` to preview before creating
- Check `examples/` for sample PRD formats
- PRDs should be 100-10,000 words for best results

## Getting Help

- Review the main [README.md](../README.md)
- Check [CHANGELOG.md](../CHANGELOG.md) for version details
- Look at example PRD in `examples/sample-task-api.md`
- Review the original PRD spec in `prd-to-github-pipeline.md`
