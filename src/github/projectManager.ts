import { graphql } from '@octokit/graphql';
import { Config, GitHubIssue } from '../types';
import { getLogger } from '../utils/logger';

export class ProjectManagerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectManagerError';
  }
}

interface ProjectV2 {
  id: string;
  number: number;
  title: string;
  url: string;
}

interface Owner {
  id: string;
  login: string;
}

interface StatusFieldOption {
  id: string;
  name: string;
  color: string;
}

interface StatusField {
  id: string;
  name: string;
  options: StatusFieldOption[];
}

interface ProjectItem {
  id: string;
}

export class ProjectManager {
  private graphqlWithAuth: typeof graphql;
  private config: Config['github'];
  private logger = getLogger();

  constructor(config: Config['github']) {
    this.config = config;
    this.graphqlWithAuth = graphql.defaults({
      headers: {
        authorization: `token ${config.token}`,
      },
    });
  }

  /**
   * Get the owner (user or organization) ID by login name
   */
  private async getOwnerId(login: string): Promise<string> {
    try {
      // Try as organization first
      const result: any = await this.graphqlWithAuth(
        `
        query($login: String!) {
          organization(login: $login) {
            id
          }
        }
        `,
        { login }
      );

      if (result.organization) {
        return result.organization.id;
      }
    } catch (error) {
      // If organization fails, try as user
    }

    try {
      const result: any = await this.graphqlWithAuth(
        `
        query($login: String!) {
          user(login: $login) {
            id
          }
        }
        `,
        { login }
      );

      if (result.user) {
        return result.user.id;
      }
    } catch (error: any) {
      throw new ProjectManagerError(`Failed to get owner ID for "${login}": ${error.message}`);
    }

    throw new ProjectManagerError(`Owner "${login}" not found as user or organization`);
  }

  /**
   * Get an existing project by number
   */
  async getProject(owner: string, projectNumber: number): Promise<ProjectV2 | null> {
    try {
      const ownerId = await this.getOwnerId(owner);

      // Try organization project first
      try {
        const result: any = await this.graphqlWithAuth(
          `
          query($login: String!, $number: Int!) {
            organization(login: $login) {
              projectV2(number: $number) {
                id
                number
                title
                url
              }
            }
          }
          `,
          { login: owner, number: projectNumber }
        );

        if (result.organization?.projectV2) {
          return result.organization.projectV2;
        }
      } catch (error) {
        // If organization fails, try user
      }

      // Try user project
      const result: any = await this.graphqlWithAuth(
        `
        query($login: String!, $number: Int!) {
          user(login: $login) {
            projectV2(number: $number) {
              id
              number
              title
              url
            }
          }
        }
        `,
        { login: owner, number: projectNumber }
      );

      if (result.user?.projectV2) {
        return result.user.projectV2;
      }

      return null;
    } catch (error: any) {
      throw new ProjectManagerError(
        `Failed to get project #${projectNumber}: ${error.message}`
      );
    }
  }

  /**
   * Create a new ProjectV2
   */
  async createProject(owner: string, title: string, description?: string): Promise<ProjectV2> {
    try {
      const ownerId = await this.getOwnerId(owner);

      const result: any = await this.graphqlWithAuth(
        `
        mutation($ownerId: ID!, $title: String!) {
          createProjectV2(input: {ownerId: $ownerId, title: $title}) {
            projectV2 {
              id
              number
              title
              url
            }
          }
        }
        `,
        { ownerId, title }
      );

      if (!result.createProjectV2?.projectV2) {
        throw new ProjectManagerError('Failed to create project: No project returned');
      }

      this.logger.debug(`Created project #${result.createProjectV2.projectV2.number}: ${title}`);

      return result.createProjectV2.projectV2;
    } catch (error: any) {
      throw new ProjectManagerError(`Failed to create project "${title}": ${error.message}`);
    }
  }

  /**
   * Create a custom Status field in the project with workflow columns
   */
  async createStatusField(projectId: string): Promise<StatusField> {
    this.logger.info('Creating custom Workflow Status field with AI+HITL columns...');

    const statusOptions = [
      { name: 'Backlog', color: 'GRAY', description: 'Issue is in the backlog and not yet ready to be worked on' },
      { name: 'Ready for AI', color: 'GREEN', description: 'Issue is ready for AI implementation' },
      { name: 'AI: Planning & Scaffold', color: 'YELLOW', description: 'AI is planning and creating initial scaffolding' },
      { name: 'AI: Implementation', color: 'ORANGE', description: 'AI is actively implementing the feature' },
      { name: 'Awaiting Review (HITL)', color: 'RED', description: 'Implementation complete, awaiting human review' },
      { name: 'Changes Requested', color: 'PURPLE', description: 'Human reviewer has requested changes' },
      { name: 'Ready to Merge', color: 'PINK', description: 'Changes approved and ready to be merged' },
      { name: 'Merged / Verification', color: 'BLUE', description: 'Code merged, undergoing verification testing' },
      { name: 'Done', color: 'GREEN', description: 'Issue is complete and verified' },
    ];

    try {
      const result: any = await this.graphqlWithAuth(
        `
        mutation($projectId: ID!, $name: String!, $dataType: ProjectV2CustomFieldType!, $options: [ProjectV2SingleSelectFieldOptionInput!]!) {
          createProjectV2Field(input: {
            projectId: $projectId
            name: $name
            dataType: $dataType
            singleSelectOptions: $options
          }) {
            projectV2Field {
              ... on ProjectV2SingleSelectField {
                id
                name
                options {
                  id
                  name
                  color
                }
              }
            }
          }
        }
        `,
        {
          projectId,
          name: 'Workflow Status',
          dataType: 'SINGLE_SELECT',
          options: statusOptions,
        }
      );

      if (!result.createProjectV2Field?.projectV2Field) {
        throw new ProjectManagerError('Failed to create Status field: No field returned');
      }

      const field = result.createProjectV2Field.projectV2Field;
      this.logger.success(`Created Status field with ${field.options.length} columns`);

      return field;
    } catch (error: any) {
      throw new ProjectManagerError(`Failed to create Status field: ${error.message}`);
    }
  }

  /**
   * Set the status field value for a project item
   */
  async setItemStatus(
    projectId: string,
    itemId: string,
    fieldId: string,
    optionId: string
  ): Promise<void> {
    try {
      await this.graphqlWithAuth(
        `
        mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $value: ProjectV2FieldValue!) {
          updateProjectV2ItemFieldValue(input: {
            projectId: $projectId
            itemId: $itemId
            fieldId: $fieldId
            value: $value
          }) {
            projectV2Item {
              id
            }
          }
        }
        `,
        {
          projectId,
          itemId,
          fieldId,
          value: { singleSelectOptionId: optionId },
        }
      );
    } catch (error: any) {
      throw new ProjectManagerError(`Failed to set item status: ${error.message}`);
    }
  }

  /**
   * Add issues to a project and set their initial status to "Backlog"
   */
  async addIssuesToProject(
    projectId: string,
    issues: GitHubIssue[],
    statusField?: StatusField
  ): Promise<void> {
    this.logger.info(`Adding ${issues.length} issues to project...`);

    // Get the "Backlog" option ID if status field is provided
    const backlogOption = statusField?.options.find(opt => opt.name === 'Backlog');

    for (const issue of issues) {
      try {
        // Extract issue node ID from the issue number
        // We need to convert the issue URL to a node ID
        const issueNodeId = await this.getIssueNodeId(issue.url);

        const result: any = await this.graphqlWithAuth(
          `
          mutation($projectId: ID!, $contentId: ID!) {
            addProjectV2ItemById(input: {projectId: $projectId, contentId: $contentId}) {
              item {
                id
              }
            }
          }
          `,
          { projectId, contentId: issueNodeId }
        );

        const itemId = result.addProjectV2ItemById?.item?.id;

        this.logger.debug(`Added issue #${issue.number} to project`);

        // Set initial status to "Backlog" if status field was created
        if (statusField && backlogOption && itemId) {
          await this.setItemStatus(projectId, itemId, statusField.id, backlogOption.id);
          this.logger.debug(`Set issue #${issue.number} status to "Backlog"`);
        }
      } catch (error: any) {
        this.logger.warn(`Failed to add issue #${issue.number} to project: ${error.message}`);
      }
    }
  }

  /**
   * Get the GraphQL node ID for an issue from its URL
   */
  private async getIssueNodeId(issueUrl: string): Promise<string> {
    // Extract owner, repo, and issue number from URL
    // Format: https://github.com/owner/repo/issues/123
    const match = issueUrl.match(/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/);
    if (!match) {
      throw new ProjectManagerError(`Invalid issue URL: ${issueUrl}`);
    }

    const [, owner, repo, issueNumber] = match;

    try {
      const result: any = await this.graphqlWithAuth(
        `
        query($owner: String!, $repo: String!, $number: Int!) {
          repository(owner: $owner, name: $repo) {
            issue(number: $number) {
              id
            }
          }
        }
        `,
        { owner, repo, number: parseInt(issueNumber, 10) }
      );

      if (!result.repository?.issue?.id) {
        throw new ProjectManagerError(`Issue not found: ${issueUrl}`);
      }

      return result.repository.issue.id;
    } catch (error: any) {
      throw new ProjectManagerError(`Failed to get issue node ID: ${error.message}`);
    }
  }

  /**
   * Get or create a project, then add issues to it
   */
  async manageProject(
    owner: string,
    title: string,
    issues: GitHubIssue[],
    existingProjectNumber?: number
  ): Promise<ProjectV2> {
    let project: ProjectV2;
    let statusField: StatusField | undefined;

    if (existingProjectNumber) {
      // Use existing project
      const existingProject = await this.getProject(owner, existingProjectNumber);
      if (!existingProject) {
        throw new ProjectManagerError(
          `Project #${existingProjectNumber} not found for owner "${owner}"`
        );
      }
      project = existingProject;
      this.logger.info(`Using existing project #${project.number}: ${project.title}`);
    } else {
      // Create new project
      project = await this.createProject(owner, title);
      this.logger.success(`Created project #${project.number}: ${project.title}`);

      // Create Status field with workflow columns
      statusField = await this.createStatusField(project.id);
    }

    // Add issues to project with initial status
    await this.addIssuesToProject(project.id, issues, statusField);

    return project;
  }
}
