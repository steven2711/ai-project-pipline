// L1: Initiative - Defines WHY we're doing this (objective, context, success metrics)
export interface Initiative {
  id: string;
  title: string;
  description: string;
  objective: string; // The WHY - business value and user outcome
  successMetrics: string[]; // How we measure success
  priority: 1 | 2 | 3 | 4 | 5;
  capabilities: Capability[]; // L2 items
}

export interface InitiativeSummary {
  id: string;
  title: string;
  description: string;
  objective: string;
  successMetrics: string[];
  priority: 1 | 2 | 3 | 4 | 5;
}

// L2: Capability/Workstream - Defines WHAT needs to exist (scope, boundaries, contracts)
export interface Capability {
  id: string;
  initiativeId: string;
  title: string;
  description: string; // WHAT capability/system is being built
  inputOutputContract: string; // API boundaries, data contracts between systems
  acceptanceCriteria: string[]; // WHAT must exist at completion (outcome-focused)
  edgeConstraints: string[]; // Edge cases, constraints, non-functional requirements
  priority: 1 | 2 | 3 | 4 | 5;
  complexity: "small" | "medium" | "large";
  estimatedHours: number;
  dependencies: string[]; // Other capability IDs
  aiContext: string; // High-level guidance (domain patterns, NOT implementation details)
  labels: string[];
  shouldCreateSubIssues: boolean; // AI decides if L3 needed based on complexity/sequencing
  deliverables: Deliverable[]; // L3 items (optional, only if shouldCreateSubIssues=true)
  tasks: ChecklistItem[]; // Simple checklist if no L3 deliverables
}

export interface CapabilitySummary {
  id: string;
  initiativeId: string;
  title: string;
  description: string;
  priority: 1 | 2 | 3 | 4 | 5;
}

// L3: Deliverable - Optional sub-issues for complex capabilities requiring review gates/sequencing
export interface Deliverable {
  id: string;
  capabilityId: string;
  title: string;
  description: string;
  completionCriteria: string[]; // WHAT must be delivered
  dependencies: string[]; // Other deliverable IDs
  requiresReviewGate: boolean; // Whether this needs approval before proceeding
}

// Simple checklist item (not a separate issue)
export interface ChecklistItem {
  id: string;
  title: string;
  description?: string;
}

// Root project structure
export interface ProjectStructure {
  title: string;
  description: string;
  techStack: TechStack;
  initiatives: Initiative[]; // Renamed from epics
  fileStructure?: FileTree; // Optional, not used in knowledge graph approach
  initialFiles?: FileContent[]; // Optional, not used in knowledge graph approach
}

export interface ProjectOverview {
  title: string;
  description: string;
  techStack: TechStack;
  initiatives: InitiativeSummary[]; // Renamed from epics
}

// Legacy type aliases for backward compatibility during migration
/** @deprecated Use Initiative instead */
export type Epic = Initiative;
/** @deprecated Use InitiativeSummary instead */
export type EpicSummary = InitiativeSummary;
/** @deprecated Use Capability instead */
export type Story = Capability;
/** @deprecated Use CapabilitySummary instead */
export type StorySummary = CapabilitySummary;
/** @deprecated Use ChecklistItem instead */
export type Task = ChecklistItem;

export interface TechStack {
  frontend?: string[];
  backend?: string[];
  database?: string[];
  testing?: string[];
  deployment?: string[];
}

export interface FileTree {
  [path: string]: "file" | "directory" | FileTree;
}

export interface FileContent {
  path: string;
  content: string;
}

export interface Config {
  github: GitHubConfig;
  anthropic: AnthropicConfig;
  tasks: TaskConfig;
  output: OutputConfig;
}

export interface GitHubConfig {
  token: string;
  owner: string;
  defaultLabels: boolean;
  projectColumns: string[];
  projectNumber?: number;
}

export interface AnthropicConfig {
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature: number;
}

export interface TaskConfig {
  maxComplexity: "small" | "medium" | "large";
  targetHours: number;
  aiReadyByDefault: boolean;
}

export interface OutputConfig {
  verbose: boolean;
  logFile: string;
  dryRun: boolean;
}

export interface PRDMetadata {
  title: string;
  description: string;
  techStack?: TechStack;
  rawContent: string;
}

export interface GitHubIssue {
  number: number;
  url: string;
  title: string;
  body: string;
}

export interface GitHubProject {
  id: string;
  number: number;
  title: string;
  url: string;
}

export interface GitHubRepository {
  name: string;
  fullName: string;
  url: string;
  owner: string;
}
