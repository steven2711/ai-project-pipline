import { Command } from 'commander';
import ora from 'ora';
import { RepoManager } from '../../github/repoManager';
import { LabelManager } from '../../github/labelManager';
import { IssueGenerator } from '../../github/issueGenerator';
import { ProjectManager } from '../../github/projectManager';
import { loadConfig, ConfigError } from '../../utils/config';
import { getLogger } from '../../utils/logger';
import { Config, ProjectStructure } from '../../types';
import { ProjectStructureSchema } from '../../types/schemas';
import * as fs from 'fs';

interface ApplyOptions {
  repo?: string;
  owner?: string;
  verbose?: boolean;
  project?: number;
  skipProject?: boolean;
}

interface SavedStructure {
  timestamp: string;
  prdFile: string;
  targetRepo: string;
  projectStructure: ProjectStructure;
}

export function applyCommand(): Command {
  const cmd = new Command('apply');

  cmd
    .description('Apply a saved project structure to GitHub')
    .argument('<structure-file>', 'Path to the saved JSON structure file')
    .option('-r, --repo <name>', 'Override repository name from saved file')
    .option('-o, --owner <name>', 'Override GitHub owner from saved file')
    .option('-v, --verbose', 'Enable verbose logging')
    .option('--project <number>', 'Add issues to existing project number', parseInt)
    .option('--skip-project', 'Skip GitHub Projects creation')
    .action(async (structureFile: string, options: ApplyOptions) => {
      await handleApplyCommand(structureFile, options);
    });

  return cmd;
}

async function handleApplyCommand(structureFile: string, options: ApplyOptions): Promise<void> {
  let spinner = ora();

  try {
    // Load configuration
    const configOverrides: Partial<Config> = {
      output: {
        verbose: options.verbose || false,
        logFile: './p2g.log',
        dryRun: false,
      },
    };

    if (options.owner) {
      configOverrides.github = {
        ...configOverrides.github,
        owner: options.owner,
      } as any;
    }

    let config: Config;
    try {
      config = loadConfig(configOverrides);
    } catch (error) {
      if (error instanceof ConfigError) {
        console.error(error.message);
        process.exit(1);
      }
      throw error;
    }

    const logger = getLogger(config.output.verbose, config.output.logFile);

    logger.info(`PRD-to-GitHub Pipeline v0.1.0`);
    logger.info(`Applying structure from: ${structureFile}`);

    // Load and validate structure file
    spinner = ora('Loading saved structure...').start();

    if (!fs.existsSync(structureFile)) {
      spinner.fail('Structure file not found');
      logger.error(`File does not exist: ${structureFile}`);
      process.exit(1);
    }

    const fileContent = fs.readFileSync(structureFile, 'utf-8');
    const savedData: SavedStructure = JSON.parse(fileContent);

    // Validate the project structure
    const projectStructure = ProjectStructureSchema.parse(savedData.projectStructure);

    spinner.succeed('Structure loaded and validated');

    // Determine target repository
    let repoOwner: string;
    let repoName: string;

    if (options.repo) {
      repoName = options.repo;
      repoOwner = options.owner || config.github.owner;
    } else {
      // Parse from saved targetRepo (format: "owner/repo")
      const [savedOwner, savedRepo] = savedData.targetRepo.split('/');
      repoOwner = options.owner || savedOwner || config.github.owner;
      repoName = savedRepo;
    }

    logger.info(`Target repository: ${repoOwner}/${repoName}`);
    logger.info(`Original PRD: ${savedData.prdFile}`);
    logger.info(`Structure generated: ${new Date(savedData.timestamp).toLocaleString()}`);

    const totalCapabilities = projectStructure.initiatives.reduce((sum: number, i) => sum + i.capabilities.length, 0);
    const totalDeliverables = projectStructure.initiatives.reduce((sum: number, i) =>
      sum + i.capabilities.reduce((capSum: number, c) => capSum + c.deliverables.length, 0), 0
    );
    const totalChecklists = projectStructure.initiatives.reduce((sum: number, i) =>
      sum + i.capabilities.reduce((capSum: number, c) => capSum + c.tasks.length, 0), 0
    );

    logger.info(`Structure: ${projectStructure.initiatives.length} initiatives, ${totalCapabilities} capabilities, ${totalDeliverables} deliverables, ${totalChecklists} checklist items`);

    // Step 1: Create or get repository
    spinner = ora('Setting up GitHub repository...').start();
    const repoManager = new RepoManager(config.github);
    const repository = await repoManager.getOrCreateRepository(
      repoName,
      projectStructure.description
    );
    spinner.succeed(`Repository ready: ${repository.url}`);

    // Step 2: Setup labels
    spinner = ora('Configuring labels...').start();
    const labelManager = new LabelManager(config.github);
    const initiativeLabels = projectStructure.initiatives.map(i => i.id);
    await labelManager.ensureLabels(repository.owner, repository.name, initiativeLabels);
    spinner.succeed('Labels configured');

    // Step 3: Generate issues
    spinner = ora('Creating GitHub issues...').start();
    const issueGenerator = new IssueGenerator(config.github);
    const issues = await issueGenerator.generateIssues(
      repository.owner,
      repository.name,
      projectStructure
    );
    spinner.succeed(`Created ${issues.length} issues`);

    // Step 4: Manage GitHub Project (optional)
    if (!options.skipProject) {
      spinner = ora('Setting up GitHub Project...').start();
      const projectManager = new ProjectManager(config.github);
      const projectNumber = options.project || config.github.projectNumber;

      const project = await projectManager.manageProject(
        repository.owner,
        projectStructure.title,
        issues,
        projectNumber
      );
      spinner.succeed(`Project ready: ${project.url}`);

      // Success summary
      logger.success('\nProject setup complete!');
      logger.info(`Repository: ${repository.url}`);
      logger.info(`Project: ${project.url}`);
      logger.info(`Issues created: ${issues.length}`);
      logger.info(`\nNext steps:`);
      logger.info(`1. Visit ${project.url} to view your project board`);
      logger.info(`2. Visit ${repository.url}/issues to view all tasks`);
      logger.info(`3. Start implementing with: gh issue list --repo ${repository.fullName}`);
    } else {
      // Success summary (no project)
      logger.success('\nProject setup complete!');
      logger.info(`Repository: ${repository.url}`);
      logger.info(`Issues created: ${issues.length}`);
      logger.info(`\nNext steps:`);
      logger.info(`1. Visit ${repository.url}/issues to view all tasks`);
      logger.info(`2. Create a GitHub Project board to organize tasks`);
      logger.info(`3. Start implementing with: gh issue list --repo ${repository.fullName}`);
    }

  } catch (error) {
    spinner.fail('Operation failed');

    const logger = getLogger();
    if (error instanceof Error) {
      logger.error(error.message, error);
    } else {
      logger.error('An unexpected error occurred');
    }

    process.exit(1);
  }
}
