import { Command } from 'commander';
import ora from 'ora';
import { PRDProcessor } from '../../core/prdProcessor';
import { AIDecomposer } from '../../core/aiDecomposer';
import { RepoManager } from '../../github/repoManager';
import { LabelManager } from '../../github/labelManager';
import { IssueGenerator } from '../../github/issueGenerator';
import { ProjectManager } from '../../github/projectManager';
import { loadConfig, ConfigError } from '../../utils/config';
import { getLogger } from '../../utils/logger';
import { Config, Initiative, ProjectStructure, Capability } from '../../types';

interface CreateOptions {
  repo: string;
  owner?: string;
  verbose?: boolean;
  dryRun?: boolean;
  twoPhase?: boolean;
  output?: string;
  project?: number;
  skipProject?: boolean;
}

export function createCommand(): Command {
  const cmd = new Command('create');

  cmd
    .description('Create a GitHub project from a PRD file')
    .argument('<prd-file>', 'Path to the PRD markdown file')
    .requiredOption('-r, --repo <name>', 'Repository name to create or use')
    .option('-o, --owner <name>', 'GitHub owner (username or organization)')
    .option('-v, --verbose', 'Enable verbose logging')
    .option('--dry-run', 'Preview without creating issues')
    .option('--two-phase', 'Use two-phase AI decomposition (recommended for large PRDs)')
    .option('--output <file>', 'Save generated structure to JSON file')
    .option('--project <number>', 'Add issues to existing project number', parseInt)
    .option('--skip-project', 'Skip GitHub Projects creation')
    .action(async (prdFile: string, options: CreateOptions) => {
      await handleCreateCommand(prdFile, options);
    });

  return cmd;
}

async function handleCreateCommand(prdFile: string, options: CreateOptions): Promise<void> {
  let spinner = ora();

  try {
    // Load configuration
    const configOverrides: Partial<Config> = {
      output: {
        verbose: options.verbose || false,
        logFile: './p2g.log',
        dryRun: options.dryRun || false,
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
    logger.info(`Processing: ${prdFile}`);
    logger.info(`Target repository: ${config.github.owner}/${options.repo}`);

    if (config.output.dryRun) {
      logger.warn('DRY RUN MODE - No changes will be made to GitHub');
    }

    // Step 1: Process PRD
    spinner = ora('Processing PRD file...').start();
    const processor = new PRDProcessor();
    const prdMetadata = await processor.processPRD(prdFile);
    spinner.succeed(`PRD processed: ${prdMetadata.title}`);

    // Step 2: AI Decomposition
    const decomposer = new AIDecomposer(config.anthropic);
    let projectStructure: ProjectStructure;

    if (options.twoPhase) {
      try {
        // Phase 1: Generate initiatives
        spinner = ora('Decomposing PRD with Claude AI (Phase 1/2: Generating initiatives)...').start();
        const overview = await decomposer.decomposeInitiatives(prdMetadata);
        spinner.succeed(`Phase 1 complete: Generated ${overview.initiatives.length} initiatives`);

        // Phase 2: Generate capabilities for each initiative
        const initiatives: Initiative[] = [];
        const failedInitiatives: Array<{ initiative: typeof overview.initiatives[0]; error: string }> = [];
        const allInitiativeIds = overview.initiatives.map(i => i.id);

        for (let i = 0; i < overview.initiatives.length; i++) {
          const initiativeSummary = overview.initiatives[i];
          spinner = ora(
            `Phase 2/2: Generating capabilities for initiative ${i + 1}/${overview.initiatives.length}: "${initiativeSummary.title}"...`
          ).start();

          try {
            const capabilities = await decomposer.decomposeInitiativeCapabilities(prdMetadata, initiativeSummary, allInitiativeIds);

            initiatives.push({
              ...initiativeSummary,
              capabilities,
            });

            const totalDeliverables = capabilities.reduce((sum, c) => sum + c.deliverables.length, 0);
            const totalChecklists = capabilities.reduce((sum, c) => sum + c.tasks.length, 0);
            spinner.succeed(
              `Initiative ${i + 1}/${overview.initiatives.length} complete: ${capabilities.length} capabilities, ${totalDeliverables} deliverables, ${totalChecklists} checklist items`
            );
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            failedInitiatives.push({ initiative: initiativeSummary, error: errorMessage });
            spinner.fail(
              `Initiative ${i + 1}/${overview.initiatives.length} failed: "${initiativeSummary.title}" - ${errorMessage.split('\n')[0]}`
            );
            logger.warn(`Continuing with remaining initiatives...`);
          }
        }

        // Check if we have any successful initiatives
        if (initiatives.length === 0) {
          // Save failed attempt details
          const fs = require('fs');
          const failureLog = {
            timestamp: new Date().toISOString(),
            prdFile: prdFile,
            overview: overview,
            failedInitiatives: failedInitiatives.map(f => ({
              initiativeId: f.initiative.id,
              initiativeTitle: f.initiative.title,
              error: f.error,
            })),
          };
          fs.writeFileSync('.p2g-failure.json', JSON.stringify(failureLog, null, 2));
          logger.error(`All initiatives failed. Details saved to .p2g-failure.json`);
          spinner.fail('AI decomposition failed');
          throw new Error('All initiatives failed to generate capabilities');
        }

        projectStructure = {
          title: overview.title,
          description: overview.description,
          techStack: overview.techStack,
          initiatives,
        };

        const totalCapabilities = initiatives.reduce((sum, i) => sum + i.capabilities.length, 0);
        const totalDeliverables = initiatives.reduce((sum, i) =>
          sum + i.capabilities.reduce((capSum, c) => capSum + c.deliverables.length, 0), 0
        );
        const totalChecklists = initiatives.reduce((sum, i) =>
          sum + i.capabilities.reduce((capSum, c) => capSum + c.tasks.length, 0), 0
        );

        if (failedInitiatives.length > 0) {
          // Save partial results
          const fs = require('fs');
          const partialResults = {
            timestamp: new Date().toISOString(),
            prdFile: prdFile,
            projectStructure,
            failedInitiatives: failedInitiatives.map(f => ({
              initiativeId: f.initiative.id,
              initiativeTitle: f.initiative.title,
              error: f.error,
            })),
          };
          fs.writeFileSync('.p2g-partial.json', JSON.stringify(partialResults, null, 2));

          logger.warn(
            `\nPartial success: ${initiatives.length}/${overview.initiatives.length} initiatives, ${totalCapabilities} capabilities, ${totalDeliverables} deliverables, ${totalChecklists} checklist items`
          );
          logger.warn(`Failed initiatives (${failedInitiatives.length}):`);
          failedInitiatives.forEach(f => {
            logger.warn(`  - ${f.initiative.title}: ${f.error.split('\n')[0]}`);
          });
          logger.info(`Partial results saved to .p2g-partial.json`);
        } else {
          logger.success(`Two-phase decomposition complete: ${initiatives.length} initiatives, ${totalCapabilities} capabilities, ${totalDeliverables} deliverables, ${totalChecklists} checklist items`);
        }
      } catch (error) {
        spinner.fail('AI decomposition failed');
        throw error;
      }
    } else {
      spinner = ora('Decomposing PRD with Claude AI...').start();
      projectStructure = await decomposer.decompose(prdMetadata);
      const totalCapabilities = projectStructure.initiatives.reduce((sum, i) => sum + i.capabilities.length, 0);
      const totalDeliverables = projectStructure.initiatives.reduce((sum, i) =>
        sum + i.capabilities.reduce((capSum, c) => capSum + c.deliverables.length, 0), 0
      );
      const totalChecklists = projectStructure.initiatives.reduce((sum, i) =>
        sum + i.capabilities.reduce((capSum, c) => capSum + c.tasks.length, 0), 0
      );
      spinner.succeed(
        `Project decomposed: ${projectStructure.initiatives.length} initiatives, ${totalCapabilities} capabilities, ${totalDeliverables} deliverables, ${totalChecklists} checklist items`
      );
    }

    // Save output to file if requested
    if (options.output) {
      const fs = require('fs');
      const outputData = {
        timestamp: new Date().toISOString(),
        prdFile: prdFile,
        targetRepo: `${config.github.owner}/${options.repo}`,
        projectStructure,
      };
      fs.writeFileSync(options.output, JSON.stringify(outputData, null, 2));
      logger.success(`Structure saved to ${options.output}`);
    }

    if (config.output.dryRun) {
      logger.info('\nProject Structure Preview:');
      projectStructure.initiatives.forEach((initiative, i) => {
        const initiativeCapabilities = initiative.capabilities.length;
        const initiativeDeliverables = initiative.capabilities.reduce((sum, c) => sum + c.deliverables.length, 0);
        logger.info(`\n${i + 1}. Initiative: ${initiative.title} (${initiativeCapabilities} capabilities)`);
        logger.info(`   Objective: ${initiative.objective}`);
        initiative.capabilities.forEach((capability, j) => {
          logger.info(`   ${i + 1}.${j + 1}. Capability: ${capability.title} [${capability.complexity}, ${capability.estimatedHours}h]`);
          if (capability.shouldCreateSubIssues) {
            capability.deliverables.forEach((deliverable, k) => {
              logger.info(`      ${i + 1}.${j + 1}.${k + 1}. Deliverable: ${deliverable.title}`);
            });
          } else {
            capability.tasks.forEach((task, k) => {
              logger.info(`      - Checklist: ${task.title}`);
            });
          }
        });
      });
      logger.info('\nDry run complete. No changes made to GitHub.');
      return;
    }

    // Step 3: Create or get repository
    spinner = ora('Setting up GitHub repository...').start();
    const repoManager = new RepoManager(config.github);
    const repository = await repoManager.getOrCreateRepository(
      options.repo,
      projectStructure.description
    );
    spinner.succeed(`Repository ready: ${repository.url}`);

    // Step 4: Setup labels
    spinner = ora('Configuring labels...').start();
    const labelManager = new LabelManager(config.github);
    const initiativeLabels = projectStructure.initiatives.map(i => i.id);
    await labelManager.ensureLabels(repository.owner, repository.name, initiativeLabels);
    spinner.succeed('Labels configured');

    // Step 5: Generate issues
    spinner = ora('Creating GitHub issues...').start();
    const issueGenerator = new IssueGenerator(config.github);
    const issues = await issueGenerator.generateIssues(
      repository.owner,
      repository.name,
      projectStructure
    );
    spinner.succeed(`Created ${issues.length} issues`);

    // Step 6: Manage GitHub Project (optional)
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
