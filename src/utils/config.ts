import * as dotenv from 'dotenv';
import { Config } from '../types';
import { ConfigSchema } from '../types/schemas';
import { z } from 'zod';

dotenv.config();

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export function loadConfig(overrides?: Partial<Config>): Config {
  const config: Partial<Config> = {
    github: {
      token: process.env.GITHUB_TOKEN || '',
      owner: process.env.GITHUB_OWNER || '',
      defaultLabels: process.env.GITHUB_DEFAULT_LABELS !== 'false',
      projectColumns: process.env.GITHUB_PROJECT_COLUMNS
        ? process.env.GITHUB_PROJECT_COLUMNS.split(',')
        : ['Backlog', 'Ready', 'In Progress', 'Review', 'Done'],
      projectNumber: process.env.GITHUB_PROJECT_NUMBER
        ? parseInt(process.env.GITHUB_PROJECT_NUMBER, 10)
        : undefined,
    },
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY || '',
      model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022',
      maxTokens: parseInt(process.env.ANTHROPIC_MAX_TOKENS || '8192', 10),
      temperature: parseFloat(process.env.ANTHROPIC_TEMPERATURE || '0.3'),
    },
    tasks: {
      maxComplexity: (process.env.TASKS_MAX_COMPLEXITY as 'small' | 'medium' | 'large') || 'large',
      targetHours: parseInt(process.env.TASKS_TARGET_HOURS || '3', 10),
      aiReadyByDefault: process.env.TASKS_AI_READY_BY_DEFAULT !== 'false',
    },
    output: {
      verbose: process.env.OUTPUT_VERBOSE === 'true',
      logFile: process.env.OUTPUT_LOG_FILE || './p2g.log',
      dryRun: process.env.OUTPUT_DRY_RUN === 'true',
    },
  };

  // Merge with overrides
  const mergedConfig = {
    github: { ...config.github, ...overrides?.github },
    anthropic: { ...config.anthropic, ...overrides?.anthropic },
    tasks: { ...config.tasks, ...overrides?.tasks },
    output: { ...config.output, ...overrides?.output },
  };

  try {
    return ConfigSchema.parse(mergedConfig);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`);
      throw new ConfigError(
        `Configuration validation failed:\n${messages.join('\n')}\n\n` +
        `Please ensure the following environment variables are set:\n` +
        `- GITHUB_TOKEN: Your GitHub Personal Access Token\n` +
        `- GITHUB_OWNER: Your GitHub username or organization\n` +
        `- ANTHROPIC_API_KEY: Your Anthropic API key\n\n` +
        `You can set these in a .env file or as environment variables.`
      );
    }
    throw error;
  }
}

export function validateConfig(config: Partial<Config>): void {
  try {
    ConfigSchema.parse(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`);
      throw new ConfigError(`Configuration validation failed:\n${messages.join('\n')}`);
    }
    throw error;
  }
}
