import { Octokit } from '@octokit/rest';
import pLimit from 'p-limit';
import { ProjectStructure, Initiative, Capability, Deliverable, GitHubIssue, Config } from '../types';
import { getLogger } from '../utils/logger';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export class IssueGeneratorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IssueGeneratorError';
  }
}

export class IssueGenerator {
  private octokit: Octokit;
  private config: Config['github'];
  private logger = getLogger();
  private capabilityIdToIssueNumber: Map<string, number> = new Map();
  private initiativeIdToIssueNumber: Map<string, number> = new Map();
  private deliverableIdToIssueNumber: Map<string, number> = new Map();

  constructor(config: Config['github']) {
    this.config = config;
    this.octokit = new Octokit({
      auth: config.token,
    });
  }

  async generateIssues(
    owner: string,
    repo: string,
    project: ProjectStructure
  ): Promise<GitHubIssue[]> {
    this.logger.info('Creating GitHub issues with three-tier hierarchy (L1→L2→L3)...');

    const allIssues: GitHubIssue[] = [];
    let totalDeliverables = 0;

    // First pass: Create L1 initiative issues (parent issues)
    for (const initiative of project.initiatives) {
      const initiativeIssue = await this.createInitiativeIssue(owner, repo, initiative);
      allIssues.push(initiativeIssue);
      this.initiativeIdToIssueNumber.set(initiative.id, initiativeIssue.number);
      await delay(1000); // 1 second delay to avoid rate limits
    }

    // Second pass: Create L2 capability issues as sub-issues of L1 initiatives
    for (const initiative of project.initiatives) {
      const initiativeNumber = this.initiativeIdToIssueNumber.get(initiative.id)!;
      for (const capability of initiative.capabilities) {
        const capabilityIssue = await this.createCapabilityIssue(owner, repo, initiative, capability, initiativeNumber);
        allIssues.push(capabilityIssue);
        this.capabilityIdToIssueNumber.set(capability.id, capabilityIssue.number);
        await delay(1000); // 1 second delay to avoid rate limits

        // Third pass: Create L3 deliverable sub-issues if needed
        if (capability.shouldCreateSubIssues && capability.deliverables.length > 0) {
          const capabilityNumber = capabilityIssue.number;
          for (const deliverable of capability.deliverables) {
            const deliverableIssue = await this.createDeliverableIssue(owner, repo, capability, deliverable, capabilityNumber);
            allIssues.push(deliverableIssue);
            this.deliverableIdToIssueNumber.set(deliverable.id, deliverableIssue.number);
            totalDeliverables++;
            await delay(1000); // 1 second delay to avoid rate limits
          }
        }
      }
    }

    // Fourth pass: Update issues with dependency references
    await this.updateCapabilityDependencies(owner, repo, project);
    await this.updateDeliverableDependencies(owner, repo, project);

    const totalCapabilities = project.initiatives.reduce((sum, i) => sum + i.capabilities.length, 0);

    this.logger.success(
      `Created ${allIssues.length} GitHub issues: ` +
      `${project.initiatives.length} initiatives (L1), ` +
      `${totalCapabilities} capabilities (L2), ` +
      `${totalDeliverables} deliverables (L3)`
    );

    return allIssues;
  }

  private async createInitiativeIssue(
    owner: string,
    repo: string,
    initiative: Initiative
  ): Promise<GitHubIssue> {
    const labels = ['type:initiative', initiative.id];

    const totalCapabilities = initiative.capabilities.length;
    const totalDeliverables = initiative.capabilities.reduce((sum, c) => sum + c.deliverables.length, 0);
    const totalChecklists = initiative.capabilities.reduce((sum, c) => sum + c.tasks.length, 0);

    let body = `## Objective (WHY)\n${initiative.objective}\n\n`;
    body += `## Description\n${initiative.description}\n\n`;

    if (initiative.successMetrics && initiative.successMetrics.length > 0) {
      body += `## Success Metrics\n`;
      initiative.successMetrics.forEach(metric => {
        body += `- ${metric}\n`;
      });
      body += '\n';
    }

    body += `## Capabilities\n`;
    body += `This initiative contains ${totalCapabilities} capabilities (L2)`;
    if (totalDeliverables > 0) {
      body += ` with ${totalDeliverables} deliverables (L3)`;
    }
    if (totalChecklists > 0) {
      body += ` and ${totalChecklists} checklist items`;
    }
    body += `.\n\n`;
    body += `**Sub-issues**: Capabilities will be linked below via GitHub sub-issues. `;
    body += `If sub-issue API is unavailable, capabilities will use \`parent:#${'{issueNumber}'}\` labels and body links instead.\n\n`;
    body += `---\n**Initiative ID**: ${initiative.id} | **Priority**: ${initiative.priority}`;

    try {
      const { data } = await this.octokit.issues.create({
        owner,
        repo,
        title: `[INITIATIVE] ${initiative.title}`,
        body,
        labels,
      });

      this.logger.debug(`Created initiative issue #${data.number}: ${initiative.title}`);

      return {
        number: data.number,
        url: data.html_url,
        title: data.title,
        body: data.body || '',
      };
    } catch (error: any) {
      throw new IssueGeneratorError(
        `Failed to create initiative issue "${initiative.title}": ${error.message}`
      );
    }
  }

  private async createCapabilityIssue(
    owner: string,
    repo: string,
    initiative: Initiative,
    capability: Capability,
    initiativeNumber: number
  ): Promise<GitHubIssue> {
    const labels = ['type:capability', initiative.id, capability.complexity, ...capability.labels];

    try {
      // Create the capability issue first
      const { data } = await this.octokit.issues.create({
        owner,
        repo,
        title: `[CAPABILITY] ${capability.title}`,
        body: this.formatCapabilityBody(initiative, capability, initiativeNumber),
        labels: [...new Set(labels)], // Remove duplicates
      });

      // Try to set parent via REST API sub-issue endpoint
      try {
        await this.octokit.request('POST /repos/{owner}/{repo}/issues/{issue_number}/sub_issues', {
          owner,
          repo,
          issue_number: initiativeNumber,
          sub_issue_id: data.number,
          headers: {
            'X-GitHub-Api-Version': '2022-11-28'
          }
        });
        this.logger.debug(`✓ Set parent relationship for capability #${data.number}`);
      } catch (apiError: any) {
        // FALLBACK STRATEGY: Sub-issue API unavailable or repository doesn't support sub-issues
        const errorMsg = apiError.message || '';
        const status = apiError.status;

        if (status === 404) {
          this.logger.warn(`Repository doesn't support sub-issues feature yet. Check your account's Feature Preview settings.`);
        } else if (status === 403) {
          this.logger.warn(`Insufficient permissions to create sub-issues. Ensure your GitHub token has 'repo' scope.`);
        } else if (status === 422) {
          this.logger.warn(`Validation failed: ${errorMsg}`);
        } else {
          this.logger.warn(`Sub-issue creation failed for #${data.number}: ${errorMsg}`);
        }

        this.logger.info(`Applying fallback strategy (labels + body text) for #${data.number}...`);

        // Fallback Step 1: Create parent label
        await this.createParentLabel(owner, repo, initiativeNumber);

        // Fallback Step 2: Add parent label to issue
        await this.octokit.issues.addLabels({
          owner,
          repo,
          issue_number: data.number,
          labels: [`parent:#${initiativeNumber}`]
        });

        // Fallback Step 3: Update issue body with parent link
        const parentLinkSection = `**Parent Issue**: #${initiativeNumber} ${initiative.title}\n\n---\n\n`;
        const updatedBody = parentLinkSection + (data.body || '');
        await this.octokit.issues.update({
          owner,
          repo,
          issue_number: data.number,
          body: updatedBody
        });

        this.logger.info(`✓ Applied fallback: parent label and body link for #${data.number}`);
      }

      this.logger.debug(`Created capability issue #${data.number}: ${capability.title}`);

      return {
        number: data.number,
        url: data.html_url,
        title: data.title,
        body: data.body || '',
      };
    } catch (error: any) {
      throw new IssueGeneratorError(
        `Failed to create capability issue "${capability.title}": ${error.message}`
      );
    }
  }

  private async createDeliverableIssue(
    owner: string,
    repo: string,
    capability: Capability,
    deliverable: Deliverable,
    capabilityNumber: number
  ): Promise<GitHubIssue> {
    const labels = ['type:deliverable', capability.initiativeId];

    try {
      // Create the deliverable issue first
      const { data } = await this.octokit.issues.create({
        owner,
        repo,
        title: `[DELIVERABLE] ${deliverable.title}`,
        body: this.formatDeliverableBody(capability, deliverable, capabilityNumber),
        labels,
      });

      // Try to set parent via REST API sub-issue endpoint
      try {
        await this.octokit.request('POST /repos/{owner}/{repo}/issues/{issue_number}/sub_issues', {
          owner,
          repo,
          issue_number: capabilityNumber,
          sub_issue_id: data.number,
          headers: {
            'X-GitHub-Api-Version': '2022-11-28'
          }
        });
        this.logger.debug(`✓ Set parent relationship for deliverable #${data.number}`);
      } catch (apiError: any) {
        // FALLBACK STRATEGY: Sub-issue API unavailable or repository doesn't support sub-issues
        const errorMsg = apiError.message || '';
        const status = apiError.status;

        if (status === 404) {
          this.logger.warn(`Repository doesn't support sub-issues feature yet. Check your account's Feature Preview settings.`);
        } else if (status === 403) {
          this.logger.warn(`Insufficient permissions to create sub-issues. Ensure your GitHub token has 'repo' scope.`);
        } else if (status === 422) {
          this.logger.warn(`Validation failed: ${errorMsg}`);
        } else {
          this.logger.warn(`Sub-issue creation failed for #${data.number}: ${errorMsg}`);
        }

        this.logger.info(`Applying fallback strategy (labels + body text) for #${data.number}...`);

        // Fallback Step 1: Create parent label
        await this.createParentLabel(owner, repo, capabilityNumber);

        // Fallback Step 2: Add parent label to issue
        await this.octokit.issues.addLabels({
          owner,
          repo,
          issue_number: data.number,
          labels: [`parent:#${capabilityNumber}`]
        });

        // Fallback Step 3: Update issue body with parent link
        const parentLinkSection = `**Parent Issue**: #${capabilityNumber} ${capability.title}\n\n---\n\n`;
        const updatedBody = parentLinkSection + (data.body || '');
        await this.octokit.issues.update({
          owner,
          repo,
          issue_number: data.number,
          body: updatedBody
        });

        this.logger.info(`✓ Applied fallback: parent label and body link for #${data.number}`);
      }

      this.logger.debug(`Created deliverable issue #${data.number}: ${deliverable.title}`);

      return {
        number: data.number,
        url: data.html_url,
        title: data.title,
        body: data.body || '',
      };
    } catch (error: any) {
      throw new IssueGeneratorError(
        `Failed to create deliverable issue "${deliverable.title}": ${error.message}`
      );
    }
  }

  private async getIssueNodeId(owner: string, repo: string, issueNumber: number): Promise<string> {
    const { data } = await this.octokit.issues.get({
      owner,
      repo,
      issue_number: issueNumber,
    });
    return data.node_id;
  }

  private async createParentLabel(owner: string, repo: string, parentNumber: number): Promise<void> {
    const labelName = `parent:#${parentNumber}`;
    try {
      await this.octokit.issues.createLabel({
        owner,
        repo,
        name: labelName,
        color: 'E4E4E4',
        description: `Child issues of #${parentNumber}`
      });
      this.logger.debug(`Created parent label: ${labelName}`);
    } catch (error: any) {
      // Label might already exist (422 status), which is fine
      if (error.status !== 422) {
        this.logger.warn(`Failed to create parent label "${labelName}": ${error.message}`);
      }
    }
  }

  private formatCapabilityBody(initiative: Initiative, capability: Capability, initiativeNumber: number): string {
    let body = `## Initiative\n#${initiativeNumber} ${initiative.title}\n\n`;

    body += `## Description (WHAT)\n${capability.description}\n\n`;

    if (capability.inputOutputContract) {
      body += `## Input/Output Contract\n${capability.inputOutputContract}\n\n`;
    }

    if (capability.acceptanceCriteria && capability.acceptanceCriteria.length > 0) {
      body += `## Acceptance Criteria (Observable Outcomes)\n`;
      capability.acceptanceCriteria.forEach(criteria => {
        body += `- [ ] ${criteria}\n`;
      });
      body += '\n';
    }

    if (capability.edgeConstraints && capability.edgeConstraints.length > 0) {
      body += `## Edge Constraints\n`;
      capability.edgeConstraints.forEach(constraint => {
        body += `- ${constraint}\n`;
      });
      body += '\n';
    }

    // Checklist section (only if no deliverables)
    if (!capability.shouldCreateSubIssues && capability.tasks && capability.tasks.length > 0) {
      body += `## Implementation Checklist\n`;
      capability.tasks.forEach(task => {
        body += `- [ ] ${task.title}\n`;
      });
      body += '\n';
    }

    // Deliverables note (if sub-issues created)
    if (capability.shouldCreateSubIssues && capability.deliverables.length > 0) {
      body += `## Deliverables\n`;
      body += `This capability has ${capability.deliverables.length} deliverable sub-issues (L3) that will be linked below.\n\n`;
    }

    if (capability.aiContext) {
      body += `## AI Implementation Context\n${capability.aiContext}\n\n`;
    }

    body += `---\n**Capability ID**: ${capability.id} | **Estimated Hours**: ${capability.estimatedHours} | **Complexity**: ${capability.complexity}`;

    return body;
  }

  private formatDeliverableBody(capability: Capability, deliverable: Deliverable, capabilityNumber: number): string {
    let body = `## Capability\n#${capabilityNumber} ${capability.title}\n\n`;

    body += `## Description\n${deliverable.description}\n\n`;

    if (deliverable.completionCriteria && deliverable.completionCriteria.length > 0) {
      body += `## Completion Criteria\n`;
      deliverable.completionCriteria.forEach(criteria => {
        body += `- [ ] ${criteria}\n`;
      });
      body += '\n';
    }

    if (deliverable.requiresReviewGate) {
      body += `## Review Gate\n⚠️ This deliverable requires review/approval before proceeding.\n\n`;
    }

    body += `---\n**Deliverable ID**: ${deliverable.id}`;

    return body;
  }

  private async updateCapabilityDependencies(
    owner: string,
    repo: string,
    project: ProjectStructure
  ): Promise<void> {
    for (const initiative of project.initiatives) {
      for (const capability of initiative.capabilities) {
        if (capability.dependencies && capability.dependencies.length > 0) {
          const issueNumber = this.capabilityIdToIssueNumber.get(capability.id);
          if (!issueNumber) continue;

          const dependencyReferences: string[] = [];
          const linkedDependencies: number[] = [];

          // Create "blocks" relationships for each dependency
          for (const depId of capability.dependencies) {
            const depNumber = this.capabilityIdToIssueNumber.get(depId);
            if (!depNumber) continue;

            try {
              // Try to create a link relationship via GraphQL
              // The dependent issue (depNumber) BLOCKS this issue (issueNumber)
              await this.octokit.graphql(`
                mutation($sourceId: ID!, $targetId: ID!) {
                  createLinkedIssue(input: {
                    issueId: $sourceId,
                    linkedIssueId: $targetId,
                    linkType: BLOCKS
                  }) {
                    linkedIssue {
                      id
                    }
                  }
                }
              `, {
                sourceId: await this.getIssueNodeId(owner, repo, depNumber),
                targetId: await this.getIssueNodeId(owner, repo, issueNumber)
              });
              linkedDependencies.push(depNumber);
              dependencyReferences.push(`#${depNumber}`);
              this.logger.debug(`✓ Linked #${depNumber} blocks #${issueNumber}`);
            } catch (graphqlError: any) {
              // Fallback: just collect for comment
              dependencyReferences.push(`#${depNumber}`);
              this.logger.warn(`Could not create link relationship, will use comment instead: ${graphqlError.message}`);
            }
          }

          // Add supplemental comment for context (even if links succeeded)
          if (dependencyReferences.length > 0) {
            const commentBody = linkedDependencies.length > 0
              ? `**Dependencies** (also linked as 'blocks' relationships): ${dependencyReferences.join(', ')}`
              : `**Dependencies**: This capability depends on ${dependencyReferences.join(', ')}`;

            await this.octokit.issues.createComment({
              owner,
              repo,
              issue_number: issueNumber,
              body: commentBody,
            });
            await delay(1000); // 1 second delay to avoid rate limits
          }
        }
      }
    }
  }

  private async updateDeliverableDependencies(
    owner: string,
    repo: string,
    project: ProjectStructure
  ): Promise<void> {
    for (const initiative of project.initiatives) {
      for (const capability of initiative.capabilities) {
        if (!capability.shouldCreateSubIssues) continue;

        for (const deliverable of capability.deliverables) {
          if (deliverable.dependencies && deliverable.dependencies.length > 0) {
            const issueNumber = this.deliverableIdToIssueNumber.get(deliverable.id);
            if (!issueNumber) continue;

            const dependencyReferences: string[] = [];
            const linkedDependencies: number[] = [];

            // Create "blocks" relationships for each dependency
            for (const depId of deliverable.dependencies) {
              const depNumber = this.deliverableIdToIssueNumber.get(depId);
              if (!depNumber) continue;

              try {
                // Try to create a link relationship via GraphQL
                // The dependent deliverable (depNumber) BLOCKS this deliverable (issueNumber)
                await this.octokit.graphql(`
                  mutation($sourceId: ID!, $targetId: ID!) {
                    createLinkedIssue(input: {
                      issueId: $sourceId,
                      linkedIssueId: $targetId,
                      linkType: BLOCKS
                    }) {
                      linkedIssue {
                        id
                      }
                    }
                  }
                `, {
                  sourceId: await this.getIssueNodeId(owner, repo, depNumber),
                  targetId: await this.getIssueNodeId(owner, repo, issueNumber)
                });
                linkedDependencies.push(depNumber);
                dependencyReferences.push(`#${depNumber}`);
                this.logger.debug(`✓ Linked #${depNumber} blocks #${issueNumber}`);
              } catch (graphqlError: any) {
                // Fallback: just collect for comment
                dependencyReferences.push(`#${depNumber}`);
                this.logger.warn(`Could not create link relationship, will use comment instead: ${graphqlError.message}`);
              }
            }

            // Add supplemental comment for context (even if links succeeded)
            if (dependencyReferences.length > 0) {
              const commentBody = linkedDependencies.length > 0
                ? `**Dependencies** (also linked as 'blocks' relationships): ${dependencyReferences.join(', ')}`
                : `**Dependencies**: This deliverable depends on ${dependencyReferences.join(', ')}`;

              await this.octokit.issues.createComment({
                owner,
                repo,
                issue_number: issueNumber,
                body: commentBody,
              });
              await delay(1000); // 1 second delay to avoid rate limits
            }
          }
        }
      }
    }
  }
}
