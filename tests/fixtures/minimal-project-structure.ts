import { ProjectStructure } from '../../src/types';

/**
 * Minimal project structure for fast integration testing
 * Contains: 1 initiative → 1 capability → 1 deliverable
 * Used to test GitHub sub-issue parent-child relationships
 */
export const minimalProjectStructure: ProjectStructure = {
  title: 'Test Sub-Issue Relationships',
  description: 'Minimal structure to test GraphQL addSubIssue mutation',
  techStack: {
    backend: ['Node.js'],
    frontend: [],
    database: [],
    testing: [],
    deployment: [],
  },
  initiatives: [
    {
      id: 'initiative-1',
      title: 'Test Initiative',
      description: 'Parent initiative for testing sub-issue relationships',
      objective: 'Verify that parent-child relationships are created correctly via GitHub GraphQL API',
      successMetrics: [
        'Capability issues are linked as sub-issues of initiative',
        'Deliverable issues are linked as sub-issues of capability',
      ],
      priority: 1,
      capabilities: [
        {
          id: 'capability-1-1',
          initiativeId: 'initiative-1',
          title: 'Test Capability',
          description: 'Capability to test initiative→capability parent-child link',
          inputOutputContract: 'N/A - Test fixture',
          acceptanceCriteria: [
            'Capability is created as sub-issue of initiative',
            'Parent relationship is visible in GitHub UI',
          ],
          edgeConstraints: [],
          priority: 1,
          complexity: 'small',
          estimatedHours: 1,
          dependencies: [],
          aiContext: '',
          labels: [],
          shouldCreateSubIssues: true,
          deliverables: [
            {
              id: 'deliverable-1-1-1',
              capabilityId: 'capability-1-1',
              title: 'Test Deliverable',
              description: 'Deliverable to test capability→deliverable parent-child link',
              completionCriteria: [
                'Deliverable is created as sub-issue of capability',
                'Parent relationship is visible in GitHub UI',
              ],
              dependencies: [],
              requiresReviewGate: false,
            },
          ],
          tasks: [],
        },
      ],
    },
  ],
};
