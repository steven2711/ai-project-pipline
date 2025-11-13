import { z } from 'zod';

export const TechStackSchema = z.object({
  frontend: z.array(z.string()).optional(),
  backend: z.array(z.string()).optional(),
  database: z.array(z.string()).optional(),
  testing: z.array(z.string()).optional(),
  deployment: z.array(z.string()).optional(),
});

// L3: Deliverable schema (optional sub-issues)
export const DeliverableSchema = z.object({
  id: z.string(),
  capabilityId: z.string(),
  title: z.string().min(1, 'Deliverable title is required'),
  description: z.string().min(1, 'Deliverable description is required'),
  completionCriteria: z.array(z.string()).default([]),
  dependencies: z.array(z.string()).default([]),
  requiresReviewGate: z.boolean().default(false),
});

// Simple checklist item schema
export const ChecklistItemSchema = z.object({
  id: z.string(),
  title: z.string().min(1, 'Checklist item title is required'),
  description: z.string().optional(),
});

// L2: Capability schema (what needs to exist)
export const CapabilitySchema = z.object({
  id: z.string(),
  initiativeId: z.string(),
  title: z.string().min(1, 'Capability title is required'),
  description: z.string().min(1, 'Capability description is required'),
  inputOutputContract: z.string().default(''),
  acceptanceCriteria: z.array(z.string()).default([]),
  edgeConstraints: z.array(z.string()).default([]),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  complexity: z.enum(['small', 'medium', 'large']),
  estimatedHours: z.number().min(0).max(40),
  dependencies: z.array(z.string()).default([]),
  aiContext: z.string().default(''),
  labels: z.array(z.string()).default([]),
  shouldCreateSubIssues: z.boolean().default(false),
  deliverables: z.array(DeliverableSchema).default([]),
  tasks: z.array(ChecklistItemSchema).default([]),
});

export const CapabilitySummarySchema = z.object({
  id: z.string(),
  initiativeId: z.string(),
  title: z.string().min(1, 'Capability title is required'),
  description: z.string(),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
});

// L1: Initiative schema (why we're doing this)
export const InitiativeSummarySchema = z.object({
  id: z.string(),
  title: z.string().min(1, 'Initiative title is required'),
  description: z.string(),
  objective: z.string().min(1, 'Initiative objective is required'),
  successMetrics: z.array(z.string()).default([]),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
});

export const InitiativeSchema = z.object({
  id: z.string(),
  title: z.string().min(1, 'Initiative title is required'),
  description: z.string(),
  objective: z.string().min(1, 'Initiative objective is required'),
  successMetrics: z.array(z.string()).default([]),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  capabilities: z.array(CapabilitySchema).min(1, 'Initiative must have at least one capability'),
});

// Project structure schemas
export const ProjectOverviewSchema = z.object({
  title: z.string().min(1, 'Project title is required'),
  description: z.string().min(1, 'Project description is required'),
  techStack: TechStackSchema,
  initiatives: z.array(InitiativeSummarySchema).min(1, 'Project must have at least one initiative'),
});

export const ProjectStructureSchema = z.object({
  title: z.string().min(1, 'Project title is required'),
  description: z.string().min(1, 'Project description is required'),
  techStack: TechStackSchema,
  initiatives: z.array(InitiativeSchema).min(1, 'Project must have at least one initiative'),
  fileStructure: z.record(z.string(), z.any()).optional(),
  initialFiles: z.array(z.object({
    path: z.string(),
    content: z.string(),
  })).optional(),
});

// Legacy schemas for backward compatibility
/** @deprecated Use ChecklistItemSchema instead */
export const TaskSchema = ChecklistItemSchema;
/** @deprecated Use CapabilitySchema instead */
export const StorySchema = CapabilitySchema;
/** @deprecated Use CapabilitySummarySchema instead */
export const StorySummarySchema = CapabilitySummarySchema;
/** @deprecated Use InitiativeSummarySchema instead */
export const EpicSummarySchema = InitiativeSummarySchema;
/** @deprecated Use InitiativeSchema instead */
export const EpicSchema = InitiativeSchema;

export const ConfigSchema = z.object({
  github: z.object({
    token: z.string().min(1, 'GitHub token is required'),
    owner: z.string().min(1, 'GitHub owner is required'),
    defaultLabels: z.boolean().default(true),
    projectColumns: z.array(z.string()).default(['Backlog', 'Ready', 'In Progress', 'Review', 'Done']),
  }),
  anthropic: z.object({
    apiKey: z.string().min(1, 'Anthropic API key is required'),
    model: z.string().default('claude-3-5-sonnet-20241022'),
    maxTokens: z.number().default(8000),
    temperature: z.number().min(0).max(1).default(0.3),
  }),
  tasks: z.object({
    maxComplexity: z.enum(['small', 'medium', 'large']).default('large'),
    targetHours: z.number().default(3),
    aiReadyByDefault: z.boolean().default(true),
  }),
  output: z.object({
    verbose: z.boolean().default(false),
    logFile: z.string().default('./p2g.log'),
    dryRun: z.boolean().default(false),
  }),
});

export type ValidatedConfig = z.infer<typeof ConfigSchema>;
export type ValidatedProjectStructure = z.infer<typeof ProjectStructureSchema>;
export type ValidatedProjectOverview = z.infer<typeof ProjectOverviewSchema>;
export type ValidatedInitiative = z.infer<typeof InitiativeSchema>;
export type ValidatedInitiativeSummary = z.infer<typeof InitiativeSummarySchema>;
export type ValidatedCapability = z.infer<typeof CapabilitySchema>;
export type ValidatedCapabilitySummary = z.infer<typeof CapabilitySummarySchema>;
export type ValidatedDeliverable = z.infer<typeof DeliverableSchema>;
export type ValidatedChecklistItem = z.infer<typeof ChecklistItemSchema>;

// Legacy type exports for backward compatibility
/** @deprecated Use ValidatedInitiative instead */
export type ValidatedEpic = ValidatedInitiative;
/** @deprecated Use ValidatedCapability instead */
export type ValidatedStory = ValidatedCapability;
/** @deprecated Use ValidatedChecklistItem instead */
export type ValidatedTask = ValidatedChecklistItem;
