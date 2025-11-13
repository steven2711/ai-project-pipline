import chalk from 'chalk';
import { writeFileSync, appendFileSync, existsSync } from 'fs';

export class Logger {
  private verbose: boolean;
  private logFile: string;

  constructor(verbose: boolean = false, logFile: string = './p2g.log') {
    this.verbose = verbose;
    this.logFile = logFile;

    // Initialize log file
    if (existsSync(this.logFile)) {
      appendFileSync(this.logFile, `\n\n=== New Session: ${new Date().toISOString()} ===\n`);
    } else {
      writeFileSync(this.logFile, `=== Log Started: ${new Date().toISOString()} ===\n`);
    }
  }

  info(message: string): void {
    console.log(chalk.blue('ℹ'), message);
    this.writeToFile(`[INFO] ${message}`);
  }

  success(message: string): void {
    console.log(chalk.green('✓'), message);
    this.writeToFile(`[SUCCESS] ${message}`);
  }

  error(message: string, error?: Error): void {
    console.error(chalk.red('✗'), message);
    this.writeToFile(`[ERROR] ${message}`);
    if (error) {
      console.error(chalk.red(error.stack || error.message));
      this.writeToFile(`[ERROR] ${error.stack || error.message}`);
    }
  }

  warn(message: string): void {
    console.warn(chalk.yellow('⚠'), message);
    this.writeToFile(`[WARN] ${message}`);
  }

  debug(message: string): void {
    if (this.verbose) {
      console.log(chalk.gray('→'), message);
      this.writeToFile(`[DEBUG] ${message}`);
    }
  }

  private writeToFile(message: string): void {
    try {
      const timestamp = new Date().toISOString();
      appendFileSync(this.logFile, `[${timestamp}] ${message}\n`);
    } catch (error) {
      // Silently fail if we can't write to log file
    }
  }
}

// Singleton instance
let loggerInstance: Logger | null = null;

export function getLogger(verbose?: boolean, logFile?: string): Logger {
  if (!loggerInstance || verbose !== undefined || logFile !== undefined) {
    loggerInstance = new Logger(verbose, logFile);
  }
  return loggerInstance;
}
