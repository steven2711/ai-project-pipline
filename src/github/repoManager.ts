import { Octokit } from '@octokit/rest';
import { GitHubRepository, Config } from '../types';
import { getLogger } from '../utils/logger';

export class RepoManagerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RepoManagerError';
  }
}

export class RepoManager {
  private octokit: Octokit;
  private config: Config['github'];
  private logger = getLogger();
  private isOrganization: boolean | null = null;

  constructor(config: Config['github']) {
    this.config = config;
    this.octokit = new Octokit({
      auth: config.token,
    });
  }

  private async checkIfOrganization(): Promise<boolean> {
    // Cache the result to avoid repeated API calls
    if (this.isOrganization !== null) {
      return this.isOrganization;
    }

    try {
      // Try to get organization info
      await this.octokit.orgs.get({
        org: this.config.owner,
      });
      this.isOrganization = true;
      this.logger.debug(`Owner '${this.config.owner}' is an organization`);
      return true;
    } catch (error: any) {
      if (error.status === 404) {
        // Not an organization, assume it's a user
        this.isOrganization = false;
        this.logger.debug(`Owner '${this.config.owner}' is a user account`);
        return false;
      }
      // For other errors, log warning and assume user account
      this.logger.warn(`Could not determine if owner is org: ${error.message}. Assuming user account.`);
      this.isOrganization = false;
      return false;
    }
  }

  async getOrCreateRepository(repoName: string, description: string): Promise<GitHubRepository> {
    this.logger.debug(`Checking if repository exists: ${this.config.owner}/${repoName}`);

    try {
      // Try to get existing repository
      const { data } = await this.octokit.repos.get({
        owner: this.config.owner,
        repo: repoName,
      });

      this.logger.info(`Using existing repository: ${data.html_url}`);

      return {
        name: data.name,
        fullName: data.full_name,
        url: data.html_url,
        owner: this.config.owner,
      };
    } catch (error: any) {
      if (error.status === 404) {
        // Repository doesn't exist, create it
        return await this.createRepository(repoName, description);
      }
      throw new RepoManagerError(`Failed to check repository: ${error.message}`);
    }
  }

  private async createRepository(repoName: string, description: string): Promise<GitHubRepository> {
    const isOrg = await this.checkIfOrganization();

    if (isOrg) {
      this.logger.info(`Creating new repository in organization '${this.config.owner}': ${repoName}`);
    } else {
      this.logger.info(`Creating new repository in user account '${this.config.owner}': ${repoName}`);
    }

    try {
      let data;

      if (isOrg) {
        // Create repository in organization
        const response = await this.octokit.repos.createInOrg({
          org: this.config.owner,
          name: repoName,
          description: description,
          private: false,
          auto_init: true, // Initialize with README
        });
        data = response.data;
        this.logger.success(`Organization repository created: ${data.html_url}`);
        this.logger.info(`⚠️  Remember to enable sub-issues: Repository → Settings → Features → Sub-issues`);
      } else {
        // Create repository for user
        const response = await this.octokit.repos.createForAuthenticatedUser({
          name: repoName,
          description: description,
          private: false,
          auto_init: true, // Initialize with README
        });
        data = response.data;
        this.logger.success(`User repository created: ${data.html_url}`);
        this.logger.warn(`Note: Sub-issues are only available for organization repositories, not personal accounts.`);
      }

      return {
        name: data.name,
        fullName: data.full_name,
        url: data.html_url,
        owner: this.config.owner,
      };
    } catch (error: any) {
      if (error.status === 422) {
        throw new RepoManagerError(`Repository name "${repoName}" is already taken or invalid`);
      }
      if (error.status === 403 && isOrg) {
        throw new RepoManagerError(
          `Permission denied to create repository in organization '${this.config.owner}'. ` +
          `Ensure your GitHub token has 'repo' and 'read:org' scopes.`
        );
      }
      throw new RepoManagerError(`Failed to create repository: ${error.message}`);
    }
  }

  async repositoryExists(repoName: string): Promise<boolean> {
    try {
      await this.octokit.repos.get({
        owner: this.config.owner,
        repo: repoName,
      });
      return true;
    } catch (error: any) {
      if (error.status === 404) {
        return false;
      }
      throw new RepoManagerError(`Failed to check repository: ${error.message}`);
    }
  }
}
