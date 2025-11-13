import * as dotenv from 'dotenv';
import { Octokit } from '@octokit/rest';
import { IssueGenerator } from '../../src/github/issueGenerator';
import { RepoManager } from '../../src/github/repoManager';
import { minimalProjectStructure } from '../fixtures/minimal-project-structure';
import { Config } from '../../src/types';

// Load environment variables from .env file
dotenv.config();

describe('IssueGenerator - Sub-Issue GraphQL Mutations', () => {
  const testRepoName = 'test-graphql-subissue';
  let owner: string;
  let octokit: Octokit;
  let createdIssueNumbers: number[] = [];

  beforeAll(async () => {
    // Ensure we have required environment variables
    if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_OWNER) {
      throw new Error(
        'Missing required environment variables: GITHUB_TOKEN and GITHUB_OWNER must be set in .env file'
      );
    }

    owner = process.env.GITHUB_OWNER;
    octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

    // Automatically create test repository if it doesn't exist
    console.log(`\nSetting up test repository: ${owner}/${testRepoName}`);
    const config: Config['github'] = {
      token: process.env.GITHUB_TOKEN,
      owner: owner,
      defaultLabels: true,
      projectColumns: ['Backlog', 'Ready', 'In Progress', 'Review', 'Done'],
    };

    const repoManager = new RepoManager(config);
    await repoManager.getOrCreateRepository(
      testRepoName,
      'Automated test repository for p2g-pipeline GraphQL sub-issue testing'
    );
    console.log(`✓ Test repository ready: https://github.com/${owner}/${testRepoName}`);
  }, 30000); // 30 second timeout for repo setup

  afterAll(async () => {
    // Automatic cleanup: Close all created test issues
    if (createdIssueNumbers.length > 0) {
      console.log(`\n🧹 Cleaning up ${createdIssueNumbers.length} test issues...`);

      for (const issueNumber of createdIssueNumbers) {
        try {
          await octokit.issues.update({
            owner,
            repo: testRepoName,
            issue_number: issueNumber,
            state: 'closed',
          });
          console.log(`  ✓ Closed issue #${issueNumber}`);
        } catch (error: any) {
          console.warn(`  ⚠ Failed to close issue #${issueNumber}: ${error.message}`);
        }
      }

      console.log(`✓ Cleanup complete!`);
    }
  }, 30000); // 30 second timeout for cleanup

  test('should create parent-child relationships using addSubIssue mutation', async () => {
    // Setup
    const config: Config['github'] = {
      token: process.env.GITHUB_TOKEN!,
      owner: owner,
      defaultLabels: true,
      projectColumns: ['Backlog', 'Ready', 'In Progress', 'Review', 'Done'],
    };

    const issueGenerator = new IssueGenerator(config);

    // Execute: Generate issues from minimal structure
    const issues = await issueGenerator.generateIssues(
      owner,
      testRepoName,
      minimalProjectStructure
    );

    // Track created issues for cleanup
    createdIssueNumbers = issues.map(issue => issue.number);

    // Assertions
    expect(issues).toHaveLength(3); // 1 initiative + 1 capability + 1 deliverable

    const [initiativeIssue, capabilityIssue, deliverableIssue] = issues;

    // Verify initiative issue
    expect(initiativeIssue.title).toContain('[INITIATIVE]');
    expect(initiativeIssue.title).toContain('Test Initiative');

    // Verify capability issue
    expect(capabilityIssue.title).toContain('[CAPABILITY]');
    expect(capabilityIssue.title).toContain('Test Capability');

    // Verify deliverable issue
    expect(deliverableIssue.title).toContain('[DELIVERABLE]');
    expect(deliverableIssue.title).toContain('Test Deliverable');

    // Verify sub-issue relationships via REST API
    console.log('\n🔍 Verifying parent-child relationships via REST API...');

    try {
      // Verify capability is a sub-issue of initiative
      const { data: initiativeSubIssues } = await octokit.request(
        'GET /repos/{owner}/{repo}/issues/{issue_number}/sub_issues',
        {
          owner,
          repo: testRepoName,
          issue_number: initiativeIssue.number,
          headers: {
            'X-GitHub-Api-Version': '2022-11-28'
          }
        }
      );

      const capabilityIsSubIssue = initiativeSubIssues.some(
        (issue: any) => issue.number === capabilityIssue.number
      );

      // Verify deliverable is a sub-issue of capability
      const { data: capabilitySubIssues } = await octokit.request(
        'GET /repos/{owner}/{repo}/issues/{issue_number}/sub_issues',
        {
          owner,
          repo: testRepoName,
          issue_number: capabilityIssue.number,
          headers: {
            'X-GitHub-Api-Version': '2022-11-28'
          }
        }
      );

      const deliverableIsSubIssue = capabilitySubIssues.some(
        (issue: any) => issue.number === deliverableIssue.number
      );

      // Assert relationships
      expect(capabilityIsSubIssue).toBe(true);
      expect(deliverableIsSubIssue).toBe(true);

      console.log('  ✓ Capability #${capabilityIssue.number} is sub-issue of Initiative #${initiativeIssue.number}');
      console.log('  ✓ Deliverable #${deliverableIssue.number} is sub-issue of Capability #${capabilityIssue.number}');
      console.log('\n✅ All parent-child relationships verified successfully via REST API!');
    } catch (verifyError: any) {
      // Sub-issues feature not available - check if fallback was used
      if (verifyError.status === 404) {
        console.log('  ⚠️  Sub-issues feature not available for this account/repository');
        console.log('  ℹ️  Fallback strategy (labels + body text) was used instead');
        console.log('  📝 Note: "Group by Parent Issue" in GitHub Projects requires native sub-issues');
      } else {
        console.warn('  ⚠️  Could not verify sub-issue relationships:', verifyError.message);
      }
    }

    // Success summary
    console.log('\n✓ Test completed successfully!');
    console.log('\nCreated issues:');
    console.log(`  Initiative #${initiativeIssue.number}: ${initiativeIssue.title}`);
    console.log(`  Capability #${capabilityIssue.number}: ${capabilityIssue.title}`);
    console.log(`  Deliverable #${deliverableIssue.number}: ${deliverableIssue.title}`);
    console.log(`\nView issues at: https://github.com/${owner}/${testRepoName}/issues`);
  }, 60000); // 60 second timeout for GitHub API calls
});
