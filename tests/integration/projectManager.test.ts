import * as dotenv from 'dotenv';
import { Octokit } from '@octokit/rest';
import { graphql } from '@octokit/graphql';
import { ProjectManager } from '../../src/github/projectManager';
import { RepoManager } from '../../src/github/repoManager';
import { Config } from '../../src/types';

// Load environment variables from .env file
dotenv.config();

describe('ProjectManager - Status Field Creation', () => {
  const testRepoName = 'test-project-status-field';
  let owner: string;
  let octokit: Octokit;
  let graphqlWithAuth: typeof graphql;
  let createdProjectNumbers: number[] = [];

  beforeAll(async () => {
    // Ensure we have required environment variables
    if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_OWNER) {
      throw new Error(
        'Missing required environment variables: GITHUB_TOKEN and GITHUB_OWNER must be set in .env file'
      );
    }

    owner = process.env.GITHUB_OWNER;
    octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    graphqlWithAuth = graphql.defaults({
      headers: {
        authorization: `token ${process.env.GITHUB_TOKEN}`,
      },
    });

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
      'Automated test repository for p2g-pipeline GitHub Projects v2 Status field testing'
    );
    console.log(`✓ Test repository ready: https://github.com/${owner}/${testRepoName}`);
  }, 30000); // 30 second timeout for repo setup

  afterAll(async () => {
    // Automatic cleanup: Delete all created projects
    if (createdProjectNumbers.length > 0) {
      console.log(`\n🧹 Cleaning up ${createdProjectNumbers.length} test project(s)...`);

      for (const projectNumber of createdProjectNumbers) {
        try {
          // Get the project ID first
          const result: any = await graphqlWithAuth(
            `
            query($login: String!, $number: Int!) {
              organization(login: $login) {
                projectV2(number: $number) {
                  id
                }
              }
            }
            `,
            { login: owner, number: projectNumber }
          );

          const projectId = result?.organization?.projectV2?.id;

          if (projectId) {
            // Delete the project
            await graphqlWithAuth(
              `
              mutation($projectId: ID!) {
                deleteProjectV2(input: {projectId: $projectId}) {
                  projectV2 {
                    id
                  }
                }
              }
              `,
              { projectId }
            );
            console.log(`  ✓ Deleted project #${projectNumber}`);
          }
        } catch (error: any) {
          console.warn(`  ⚠ Failed to delete project #${projectNumber}: ${error.message}`);
        }
      }

      console.log(`✓ Cleanup complete!`);
    }
  }, 30000); // 30 second timeout for cleanup

  test('should create project with Status field containing 9 workflow columns', async () => {
    // Setup
    const config: Config['github'] = {
      token: process.env.GITHUB_TOKEN!,
      owner: owner,
      defaultLabels: true,
      projectColumns: ['Backlog', 'Ready', 'In Progress', 'Review', 'Done'],
    };

    const projectManager = new ProjectManager(config);

    // Execute: Create a new project
    const projectTitle = 'Test Project for Status Field';
    const project = await projectManager.createProject(owner, projectTitle);

    // Track for cleanup
    createdProjectNumbers.push(project.number);

    // Verify project was created
    expect(project).toBeDefined();
    expect(project.number).toBeGreaterThan(0);
    expect(project.title).toBe(projectTitle);

    console.log(`\n✓ Created project #${project.number}: ${project.title}`);

    // Execute: Create Status field with 9 columns
    const statusField = await projectManager.createStatusField(project.id);

    // Verify Workflow Status field was created
    expect(statusField).toBeDefined();
    expect(statusField.id).toBeDefined();
    expect(statusField.name).toBe('Workflow Status');
    expect(statusField.options).toHaveLength(9);

    console.log(`\n✓ Created Status field with ${statusField.options.length} columns`);

    // Verify all 9 columns with correct names, colors, and descriptions
    const expectedColumns = [
      { name: 'Backlog', color: 'GRAY' },
      { name: 'Ready for AI', color: 'GREEN' },
      { name: 'AI: Planning & Scaffold', color: 'YELLOW' },
      { name: 'AI: Implementation', color: 'ORANGE' },
      { name: 'Awaiting Review (HITL)', color: 'RED' },
      { name: 'Changes Requested', color: 'PURPLE' },
      { name: 'Ready to Merge', color: 'PINK' },
      { name: 'Merged / Verification', color: 'BLUE' },
      { name: 'Done', color: 'GREEN' },
    ];

    console.log('\n📋 Verifying Status field columns:');
    for (let i = 0; i < expectedColumns.length; i++) {
      const expected = expectedColumns[i];
      const actual = statusField.options[i];

      expect(actual.name).toBe(expected.name);
      expect(actual.color).toBe(expected.color);
      expect(actual.id).toBeDefined(); // Each option should have an ID

      console.log(`  ✓ Column ${i + 1}: ${actual.name} (${actual.color})`);
    }

    console.log('\n✅ All Status field columns verified successfully!');
    console.log(`\nView project at: ${project.url}`);
  }, 60000); // 60 second timeout for GitHub API calls

  test('should set initial status to Backlog when adding issues', async () => {
    // This test verifies that issues added to the project get the "Backlog" status set
    const config: Config['github'] = {
      token: process.env.GITHUB_TOKEN!,
      owner: owner,
      defaultLabels: true,
      projectColumns: ['Backlog', 'Ready', 'In Progress', 'Review', 'Done'],
    };

    const projectManager = new ProjectManager(config);

    // Create a new project for this test
    const projectTitle = 'Test Project for Issue Status';
    const project = await projectManager.createProject(owner, projectTitle);

    // Track for cleanup
    createdProjectNumbers.push(project.number);

    console.log(`\n✓ Created project #${project.number}: ${project.title}`);

    // Create Status field
    const statusField = await projectManager.createStatusField(project.id);

    console.log(`\n✓ Created Status field with ${statusField.options.length} columns`);

    // Create a test issue
    const { data: issue } = await octokit.issues.create({
      owner,
      repo: testRepoName,
      title: 'Test Issue for Status Field',
      body: 'This is a test issue to verify Status field functionality',
    });

    console.log(`\n✓ Created test issue #${issue.number}`);

    // Add issue to project with Backlog status
    await projectManager.addIssuesToProject(
      project.id,
      [{
        number: issue.number,
        url: issue.html_url,
        title: issue.title,
        body: issue.body || ''
      }],
      statusField
    );

    console.log(`\n✓ Added issue #${issue.number} to project with Backlog status`);

    // Wait a moment for GitHub to index the added item
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Verify issue was added with Backlog status
    const itemsResult: any = await graphqlWithAuth(
      `
      query($projectId: ID!) {
        node(id: $projectId) {
          ... on ProjectV2 {
            items(first: 10) {
              nodes {
                id
                content {
                  ... on Issue {
                    number
                  }
                }
                fieldValueByName(name: "Workflow Status") {
                  ... on ProjectV2ItemFieldSingleSelectValue {
                    name
                  }
                }
              }
            }
          }
        }
      }
      `,
      { projectId: project.id }
    );

    const projectItem = itemsResult.node.items.nodes.find(
      (item: any) => item.content?.number === issue.number
    );

    expect(projectItem).toBeDefined();
    expect(projectItem.fieldValueByName?.name).toBe('Backlog');

    console.log(`\n✅ Verified issue #${issue.number} has "Backlog" status in project!`);

    // Cleanup: Close the test issue
    await octokit.issues.update({
      owner,
      repo: testRepoName,
      issue_number: issue.number,
      state: 'closed',
    });

    console.log(`\n✓ Cleaned up test issue #${issue.number}`);
  }, 60000); // 60 second timeout for GitHub API calls
});
