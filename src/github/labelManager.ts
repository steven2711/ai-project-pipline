import { Octokit } from '@octokit/rest';
import { Config } from '../types';
import { getLogger } from '../utils/logger';

export class LabelManagerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LabelManagerError';
  }
}

interface LabelDefinition {
  name: string;
  color: string;
  description: string;
}

export class LabelManager {
  private octokit: Octokit;
  private config: Config['github'];
  private logger = getLogger();

  private readonly DEFAULT_LABELS: LabelDefinition[] = [
    // Knowledge Graph Hierarchy (L1, L2, L3)
    { name: 'type:initiative', color: '8B5CF6', description: 'L1 Initiative - WHY (objective, outcome, metrics)' },
    { name: 'type:capability', color: '10B981', description: 'L2 Capability - WHAT (scope, contracts, boundaries)' },
    { name: 'type:deliverable', color: '3B82F6', description: 'L3 Deliverable - Sub-issue with review gate' },

    // Type labels
    { name: 'feature', color: '0E8A16', description: 'New feature or capability' },
    { name: 'bug', color: 'D73A4A', description: 'Something is not working' },
    { name: 'enhancement', color: 'A2EEEF', description: 'Improvement to existing feature' },

    // Area labels
    { name: 'backend', color: '0052CC', description: 'Backend-related work' },
    { name: 'frontend', color: 'FBCA04', description: 'Frontend-related work' },
    { name: 'database', color: '5319E7', description: 'Database-related work' },
    { name: 'testing', color: 'BFD4F2', description: 'Testing-related work' },
    { name: 'documentation', color: '0075CA', description: 'Documentation improvements' },

    // Complexity labels
    { name: 'small', color: 'C2E0C6', description: 'Small capability (<4 hours)' },
    { name: 'medium', color: 'FEF2C0', description: 'Medium capability (4-8 hours)' },
    { name: 'large', color: 'F9C5D1', description: 'Large capability (8-16 hours)' },
  ];

  constructor(config: Config['github']) {
    this.config = config;
    this.octokit = new Octokit({
      auth: config.token,
    });
  }

  async ensureLabels(owner: string, repo: string, customLabels?: string[]): Promise<void> {
    if (!this.config.defaultLabels && !customLabels?.length) {
      this.logger.debug('Skipping label creation (disabled in config)');
      return;
    }

    this.logger.debug('Ensuring labels exist in repository');

    const labelsToCreate = this.config.defaultLabels ? this.DEFAULT_LABELS : [];

    // Add custom labels if provided
    if (customLabels?.length) {
      for (const labelName of customLabels) {
        if (!labelsToCreate.find(l => l.name === labelName)) {
          labelsToCreate.push({
            name: labelName,
            color: this.generateColor(labelName),
            description: `Custom label: ${labelName}`,
          });
        }
      }
    }

    // Get existing labels
    const existingLabels = await this.getExistingLabels(owner, repo);
    const existingLabelNames = new Set(existingLabels.map(l => l.name.toLowerCase()));

    // Create missing labels
    for (const label of labelsToCreate) {
      if (!existingLabelNames.has(label.name.toLowerCase())) {
        await this.createLabel(owner, repo, label);
      } else {
        this.logger.debug(`Label "${label.name}" already exists`);
      }
    }

    this.logger.success(`Labels configured (${labelsToCreate.length} labels)`);
  }

  private async getExistingLabels(owner: string, repo: string): Promise<Array<{ name: string }>> {
    try {
      const { data } = await this.octokit.issues.listLabelsForRepo({
        owner,
        repo,
        per_page: 100,
      });
      return data;
    } catch (error: any) {
      throw new LabelManagerError(`Failed to get existing labels: ${error.message}`);
    }
  }

  private async createLabel(owner: string, repo: string, label: LabelDefinition): Promise<void> {
    try {
      await this.octokit.issues.createLabel({
        owner,
        repo,
        name: label.name,
        color: label.color,
        description: label.description,
      });
      this.logger.debug(`Created label: ${label.name}`);
    } catch (error: any) {
      // Ignore if label already exists (race condition)
      if (error.status !== 422) {
        this.logger.warn(`Failed to create label "${label.name}": ${error.message}`);
      }
    }
  }

  private generateColor(text: string): string {
    // Simple hash function to generate consistent colors
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = text.charCodeAt(i) + ((hash << 5) - hash);
    }
    const color = Math.abs(hash).toString(16).substring(0, 6).padEnd(6, '0');
    return color.toUpperCase();
  }
}
