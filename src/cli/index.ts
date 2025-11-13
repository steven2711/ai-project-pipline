import { Command } from 'commander';
import { createCommand } from './commands/create';
import { applyCommand } from './commands/apply';

export function createCLI(): Command {
  const program = new Command();

  program
    .name('p2g')
    .description('PRD-to-GitHub Pipeline: Transform PRDs into structured GitHub projects')
    .version('0.1.0');

  // Add commands
  program.addCommand(createCommand());
  program.addCommand(applyCommand());

  return program;
}
