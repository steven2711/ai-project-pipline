import Anthropic from '@anthropic-ai/sdk';
import { ProjectStructure, PRDMetadata, Config, ProjectOverview, Initiative, InitiativeSummary, Capability } from '../types';
import { ProjectStructureSchema, ProjectOverviewSchema, CapabilitySchema } from '../types/schemas';
import { getLogger } from '../utils/logger';
import { z } from 'zod';

export class AIDecomposerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AIDecomposerError';
  }
}

export class AIDecomposer {
  private client: Anthropic;
  private config: Config['anthropic'];
  private logger = getLogger();

  constructor(config: Config['anthropic']) {
    this.config = config;
    this.client = new Anthropic({
      apiKey: config.apiKey,
    });
  }

  async decompose(prdMetadata: PRDMetadata): Promise<ProjectStructure> {
    this.logger.debug('Starting AI decomposition of PRD');

    const prompt = this.buildPrompt(prdMetadata);

    try {
      const response = await this.client.messages.create({
        model: this.config.model,
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      // Check if response was truncated due to max_tokens limit
      if (response.stop_reason === 'max_tokens') {
        throw new AIDecomposerError(
          `AI response was truncated due to insufficient output token limit.\n\n` +
          `Current max_tokens: ${this.config.maxTokens}\n` +
          `Response was cut off before completion (stop_reason: max_tokens)\n\n` +
          `Solutions:\n` +
          `1. Use two-phase decomposition (RECOMMENDED for large PRDs):\n` +
          `   Add --two-phase flag to your command\n\n` +
          `2. Increase the output limit by adding to your .env file:\n` +
          `   ANTHROPIC_MAX_TOKENS=8192\n\n` +
          `3. Simplify your PRD to reduce the response size\n\n` +
          `4. Split your PRD into smaller documents and process separately`
        );
      }

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new AIDecomposerError('Unexpected response type from Claude API');
      }

      const jsonText = this.extractJSON(content.text);
      const parsed = JSON.parse(jsonText);

      // Validate against schema
      const validated = ProjectStructureSchema.parse(parsed);

      this.logger.debug(`Successfully decomposed PRD into ${validated.initiatives.length} initiatives`);

      return validated as ProjectStructure;
    } catch (error) {
      if (error instanceof Anthropic.APIError) {
        throw new AIDecomposerError(`Claude API error: ${error.message}`);
      }
      if (error instanceof SyntaxError) {
        throw new AIDecomposerError(`Failed to parse Claude response as JSON: ${error.message}`);
      }
      throw error;
    }
  }

  async decomposeInitiatives(prdMetadata: PRDMetadata): Promise<ProjectOverview> {
    this.logger.debug('Starting AI decomposition - Phase 1: Generating initiatives');

    const prompt = this.buildInitiativesPrompt(prdMetadata);

    try {
      const response = await this.client.messages.create({
        model: this.config.model,
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      if (response.stop_reason === 'max_tokens') {
        throw new AIDecomposerError(
          `AI response was truncated during initiative generation.\n\n` +
          `Current max_tokens: ${this.config.maxTokens}\n` +
          `Please increase ANTHROPIC_MAX_TOKENS or simplify your PRD.`
        );
      }

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new AIDecomposerError('Unexpected response type from Claude API');
      }

      const jsonText = this.extractJSON(content.text);
      const parsed = JSON.parse(jsonText);

      const validated = ProjectOverviewSchema.parse(parsed);

      this.logger.debug(`Successfully generated ${validated.initiatives.length} initiatives`);

      return validated as ProjectOverview;
    } catch (error) {
      if (error instanceof Anthropic.APIError) {
        throw new AIDecomposerError(`Claude API error: ${error.message}`);
      }
      if (error instanceof SyntaxError) {
        throw new AIDecomposerError(`Failed to parse Claude response as JSON: ${error.message}`);
      }
      throw error;
    }
  }

  async decomposeInitiativeCapabilities(
    prdMetadata: PRDMetadata,
    initiativeSummary: InitiativeSummary,
    allInitiativeIds: string[]
  ): Promise<Capability[]> {
    this.logger.debug(`Decomposing capabilities for initiative: ${initiativeSummary.id}`);

    const prompt = this.buildCapabilitiesPrompt(prdMetadata, initiativeSummary, allInitiativeIds);

    try {
      const response = await this.client.messages.create({
        model: this.config.model,
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      if (response.stop_reason === 'max_tokens') {
        throw new AIDecomposerError(
          `AI response was truncated for initiative "${initiativeSummary.title}".\n\n` +
          `Current max_tokens: ${this.config.maxTokens}\n` +
          `This initiative may be too complex. Consider breaking it into smaller initiatives.`
        );
      }

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new AIDecomposerError('Unexpected response type from Claude API');
      }

      const jsonText = this.extractJSON(content.text);
      const parsed = JSON.parse(jsonText);

      const capabilitiesSchema = z.array(CapabilitySchema).min(1, 'Initiative must have at least one capability');
      const validated = capabilitiesSchema.parse(parsed);

      this.logger.debug(`Generated ${validated.length} capabilities for initiative ${initiativeSummary.id}`);

      return validated as Capability[];
    } catch (error) {
      if (error instanceof Anthropic.APIError) {
        throw new AIDecomposerError(`Claude API error for initiative "${initiativeSummary.title}": ${error.message}`);
      }
      if (error instanceof SyntaxError) {
        throw new AIDecomposerError(`Failed to parse capabilities for initiative "${initiativeSummary.title}": ${error.message}`);
      }
      throw error;
    }
  }

  async decomposeTwoPhase(prdMetadata: PRDMetadata): Promise<ProjectStructure> {
    this.logger.debug('Starting two-phase AI decomposition');

    // Phase 1: Generate initiatives
    const overview = await this.decomposeInitiatives(prdMetadata);

    // Phase 2: Generate capabilities for each initiative
    const initiatives: Initiative[] = [];
    const allInitiativeIds = overview.initiatives.map(i => i.id);

    for (const initiativeSummary of overview.initiatives) {
      const capabilities = await this.decomposeInitiativeCapabilities(prdMetadata, initiativeSummary, allInitiativeIds);

      initiatives.push({
        ...initiativeSummary,
        capabilities,
      });
    }

    const projectStructure: ProjectStructure = {
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

    this.logger.debug(
      `Two-phase decomposition complete: ${initiatives.length} initiatives, ${totalCapabilities} capabilities, ${totalDeliverables} deliverables, ${totalChecklists} checklist items`
    );

    return projectStructure;
  }

  private buildPrompt(prdMetadata: PRDMetadata): string {
    return `You are an expert software project planner. Your task is to analyze a Product Requirements Document (PRD) and decompose it into a knowledge graph structure with initiatives (L1) and capabilities (L2).

# PRD Content

Title: ${prdMetadata.title}
Description: ${prdMetadata.description}

${prdMetadata.rawContent}

# Instructions

Your job is to define WHAT needs to be built and WHY, NOT HOW to implement it. The implementer (AI or human) will decide the implementation details.

1. **L1 - Initiatives**: Identify 3-6 major initiatives that define WHY we're doing this
   - Focus on objectives, context, success metrics, and business value
   - Each initiative represents a major outcome or user/business goal

2. **L2 - Capabilities**: For each initiative, identify 3-8 capabilities that define WHAT needs to exist
   - Focus on scope boundaries, input/output contracts, acceptance criteria
   - Define WHAT the system must do, not HOW it will be implemented
   - Do NOT specify file paths or implementation details
   - Identify which capabilities need sub-issues for complex sequencing (set shouldCreateSubIssues: true)

3. **Dependencies**: Identify dependencies between capabilities (use capability IDs)

4. **Complexity**: Estimate rough complexity (small: <4h, medium: 4-8h, large: 8-16h)

# Output Format

Return ONLY valid JSON matching this structure (no markdown, no explanations):

{
  "title": "Project Title",
  "description": "Brief project description",
  "techStack": {
    "frontend": ["technology1", "technology2"],
    "backend": ["technology1"],
    "database": ["database1"],
    "testing": ["test-framework"],
    "deployment": ["platform"]
  },
  "initiatives": [
    {
      "id": "initiative-1",
      "title": "Initiative Title",
      "description": "What this initiative accomplishes",
      "objective": "WHY we're doing this - the business value and user outcome",
      "successMetrics": ["Metric 1", "Metric 2"],
      "priority": 1,
      "capabilities": [
        {
          "id": "capability-1-1",
          "initiativeId": "initiative-1",
          "title": "Capability Title",
          "description": "WHAT this capability provides - the scope and boundaries",
          "inputOutputContract": "API contracts, data contracts, or system boundaries",
          "acceptanceCriteria": [
            "WHAT must exist at completion (outcome-focused)",
            "Observable behavior or deliverable"
          ],
          "edgeConstraints": ["Edge case 1", "Non-functional requirement"],
          "priority": 1,
          "complexity": "medium",
          "estimatedHours": 6,
          "dependencies": [],
          "aiContext": "High-level domain patterns and architectural guidance (NOT file paths or implementation steps)",
          "labels": ["feature", "backend"],
          "shouldCreateSubIssues": false,
          "deliverables": [],
          "tasks": [
            {"id": "task-1-1-1", "title": "Simple checklist action item"}
          ]
        }
      ]
    }
  ]
}

# Critical Guidelines

- **DO NOT** specify file paths (no filesToCreate, no filesToModify)
- **DO NOT** provide step-by-step implementation instructions
- **DO NOT** prescribe specific code patterns or libraries
- **DO** focus on WHAT needs to exist and WHY it's needed
- **DO** define clear input/output contracts for capability boundaries
- **DO** write outcome-focused acceptance criteria
- **DO** set shouldCreateSubIssues: true only if the capability requires review gates or complex sequencing
- **DO** keep aiContext high-level (domain concepts, not implementation details)

Generate IDs in format:
- Initiatives: "initiative-{number}"
- Capabilities: "capability-{initiative-number}-{capability-number}"
- Checklist tasks: "task-{initiative-number}-{capability-number}-{task-number}"

Return ONLY the JSON, nothing else.`;
  }

  private buildInitiativesPrompt(prdMetadata: PRDMetadata): string {
    return `You are an expert software project planner. Your task is to analyze a Product Requirements Document (PRD) and identify the major initiatives (L1) that define WHY we're building this.

# PRD Content

Title: ${prdMetadata.title}
Description: ${prdMetadata.description}

${prdMetadata.rawContent}

# Instructions

1. Analyze the PRD and identify 3-6 major initiatives
2. Each initiative should answer: WHY are we doing this? What's the user/business outcome?
3. For each initiative, provide:
   - A unique ID in format "initiative-{number}"
   - A clear, outcome-focused title
   - A description of what will be achieved
   - An objective explaining the WHY (business value, user outcome)
   - Success metrics (how we measure achievement)
   - Priority level (1=critical to 5=nice-to-have)
4. Do NOT generate capabilities yet - we will do that in a separate step

# Output Format

Return ONLY valid JSON matching this structure (no markdown, no explanations):

{
  "title": "Project Title",
  "description": "Brief project description",
  "techStack": {
    "frontend": ["technology1", "technology2"],
    "backend": ["technology1"],
    "database": ["database1"],
    "testing": ["test-framework"],
    "deployment": ["platform"]
  },
  "initiatives": [
    {
      "id": "initiative-1",
      "title": "Initiative Title",
      "description": "What this initiative accomplishes",
      "objective": "WHY we're doing this - the business value and user outcome",
      "successMetrics": [
        "Measurable outcome 1",
        "Measurable outcome 2"
      ],
      "priority": 1
    }
  ]
}

# Guidelines

- Focus on WHY, not HOW or WHAT
- Initiative titles should be outcome-focused (e.g., "Enable User Self-Service", not "Build User API")
- Objectives should explain business value or user benefit
- Success metrics should be observable/measurable
- Order initiatives by priority (most critical first)
- Generate initiative IDs in format: "initiative-{number}"

Return ONLY the JSON, nothing else.`;
  }

  private buildCapabilitiesPrompt(prdMetadata: PRDMetadata, initiativeSummary: InitiativeSummary, allInitiativeIds: string[]): string {
    const initiativeNumber = initiativeSummary.id.split('-')[1];
    return `You are an expert software project planner. Your task is to break down a specific initiative into capabilities (L2) that define WHAT needs to exist.

# PRD Context

Title: ${prdMetadata.title}
Description: ${prdMetadata.description}

${prdMetadata.rawContent}

# Initiative to Decompose

ID: ${initiativeSummary.id}
Title: ${initiativeSummary.title}
Description: ${initiativeSummary.description}
Objective: ${initiativeSummary.objective}
Success Metrics: ${initiativeSummary.successMetrics.join(', ')}
Priority: ${initiativeSummary.priority}

# Available Initiative IDs (for cross-capability dependencies)

${allInitiativeIds.join(', ')}

# Instructions

Your job is to define WHAT needs to exist, NOT HOW to implement it. Focus on outcomes and contracts.

1. Break down this initiative into 3-8 capabilities (major features/systems)
2. Each capability defines WHAT must exist at completion (scope boundaries, contracts, acceptance criteria)
3. For each capability:
   - Define input/output contracts (API boundaries, data contracts)
   - Write outcome-focused acceptance criteria (WHAT must exist, not HOW to build it)
   - List edge constraints (edge cases, non-functional requirements)
   - DO NOT specify file paths or implementation steps
   - Set shouldCreateSubIssues: true ONLY if it requires review gates or complex sequencing
   - If shouldCreateSubIssues is false, include 2-5 simple checklist items in "tasks"
   - If shouldCreateSubIssues is true, add deliverables (sub-issues with completion criteria)
4. Identify dependencies between CAPABILITIES using capability IDs
5. Estimate complexity (small: <4h, medium: 4-8h, large: 8-16h)

# Output Format

Return ONLY valid JSON - an array of capabilities (no markdown, no explanations):

[
  {
    "id": "capability-${initiativeNumber}-1",
    "initiativeId": "${initiativeSummary.id}",
    "title": "Capability Title (WHAT needs to exist)",
    "description": "Detailed description of WHAT this capability provides and the scope boundaries",
    "inputOutputContract": "API contracts, data contracts, or system boundaries - HOW this capability interacts with others",
    "acceptanceCriteria": [
      "Observable outcome 1 (WHAT must exist)",
      "Observable outcome 2"
    ],
    "edgeConstraints": [
      "Edge case or non-functional requirement",
      "Performance/security/scale constraint"
    ],
    "priority": ${initiativeSummary.priority},
    "complexity": "medium",
    "estimatedHours": 6,
    "dependencies": [],
    "aiContext": "High-level domain patterns and architectural guidance (NOT file paths or code snippets)",
    "labels": ["feature", "backend"],
    "shouldCreateSubIssues": false,
    "deliverables": [],
    "tasks": [
      {"id": "task-${initiativeNumber}-1-1", "title": "Simple action item for checklist"},
      {"id": "task-${initiativeNumber}-1-2", "title": "Another action item"}
    ]
  },
  {
    "id": "capability-${initiativeNumber}-2",
    "initiativeId": "${initiativeSummary.id}",
    "title": "Complex Capability Requiring Sub-Issues",
    "description": "This capability is complex and requires sequential deliverables with review gates",
    "inputOutputContract": "API contracts",
    "acceptanceCriteria": ["Outcome 1"],
    "edgeConstraints": [],
    "priority": ${initiativeSummary.priority},
    "complexity": "large",
    "estimatedHours": 14,
    "dependencies": ["capability-${initiativeNumber}-1"],
    "aiContext": "High-level guidance",
    "labels": ["feature"],
    "shouldCreateSubIssues": true,
    "deliverables": [
      {
        "id": "deliverable-${initiativeNumber}-2-1",
        "capabilityId": "capability-${initiativeNumber}-2",
        "title": "First Deliverable",
        "description": "WHAT must be delivered first",
        "completionCriteria": ["Observable outcome"],
        "dependencies": [],
        "requiresReviewGate": true
      }
    ],
    "tasks": []
  }
]

# Critical Guidelines

- **DO NOT** specify file paths (no filesToCreate, no filesToModify, no technicalNotes with implementation steps)
- **DO NOT** provide step-by-step implementation instructions
- **DO NOT** prescribe specific code patterns or libraries in aiContext
- **DO** focus on WHAT needs to exist and WHY it's needed
- **DO** define clear input/output contracts for capability boundaries
- **DO** write outcome-focused acceptance criteria (observable, measurable)
- **DO** set shouldCreateSubIssues: true sparingly (only when truly needed for sequencing/gates)
- **DO** keep aiContext high-level (domain concepts, architectural patterns, NOT code)
- **DO** use deliverables when shouldCreateSubIssues is true, tasks when false

Dependencies can reference capabilities from this initiative OR other initiatives (format: "capability-{initiative}-{number}").

Generate IDs:
- Capabilities: "capability-${initiativeNumber}-{number}"
- Deliverables: "deliverable-${initiativeNumber}-{capability-number}-{deliverable-number}"
- Tasks: "task-${initiativeNumber}-{capability-number}-{task-number}"

Return ONLY the JSON array, nothing else.`;
  }

  private extractJSON(text: string): string {
    // Remove markdown code blocks if present
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      return jsonMatch[1].trim();
    }

    // If no code blocks, assume the entire text is JSON
    return text.trim();
  }
}
