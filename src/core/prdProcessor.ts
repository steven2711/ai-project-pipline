import { readFileSync, existsSync } from 'fs';
import { PRDMetadata, TechStack } from '../types';
import { getLogger } from '../utils/logger';

export class PRDProcessorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PRDProcessorError';
  }
}

export class PRDProcessor {
  private logger = getLogger();

  async processPRD(prdPath: string): Promise<PRDMetadata> {
    this.logger.debug(`Processing PRD from: ${prdPath}`);

    // Validate file exists
    if (!existsSync(prdPath)) {
      throw new PRDProcessorError(`PRD file not found: ${prdPath}`);
    }

    // Read file content
    let content: string;
    try {
      content = readFileSync(prdPath, 'utf-8');
    } catch (error) {
      throw new PRDProcessorError(`Failed to read PRD file: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Validate content
    if (!content || content.trim().length === 0) {
      throw new PRDProcessorError('PRD file is empty');
    }

    if (content.length < 100) {
      throw new PRDProcessorError('PRD file is too short (minimum 100 characters)');
    }

    if (content.length > 100000) {
      throw new PRDProcessorError('PRD file is too large (maximum 100,000 characters)');
    }

    // Extract metadata
    const metadata = this.extractMetadata(content);

    this.logger.debug(`Extracted PRD metadata: ${metadata.title}`);

    return {
      ...metadata,
      rawContent: content,
    };
  }

  private extractMetadata(content: string): Omit<PRDMetadata, 'rawContent'> {
    const title = this.extractTitle(content);
    const description = this.extractDescription(content);
    const techStack = this.extractTechStack(content);

    return {
      title: title || 'Untitled Project',
      description: description || 'No description provided',
      techStack,
    };
  }

  private extractTitle(content: string): string | null {
    // Look for first H1 heading
    const h1Match = content.match(/^#\s+(.+)$/m);
    if (h1Match) {
      return h1Match[1].trim();
    }

    // Look for "Project Name" or "Product Name" sections
    const nameMatch = content.match(/(?:Project|Product)\s+Name[:\s]+(.+?)(?:\n|$)/i);
    if (nameMatch) {
      return nameMatch[1].trim().replace(/^\*\*|\*\*$/g, '');
    }

    return null;
  }

  private extractDescription(content: string): string | null {
    // Look for "Overview", "Description", or "Vision Statement" sections
    const descriptionPatterns = [
      /(?:##\s+Overview|##\s+Description|##\s+Vision\s+Statement)\s*\n+(.+?)(?:\n#|\n\n#|$)/is,
      /(?:###\s+Vision\s+Statement)\s*\n+(.+?)(?:\n#|\n\n#|$)/is,
      /(?:##\s+Problem\s+Statement)\s*\n+(.+?)(?:\n#|\n\n#|$)/is,
    ];

    for (const pattern of descriptionPatterns) {
      const match = content.match(pattern);
      if (match) {
        return match[1].trim().replace(/\n+/g, ' ').substring(0, 500);
      }
    }

    // Fallback: get first paragraph after title
    const paragraphMatch = content.match(/^#.+?\n+(.+?)(?:\n\n|$)/s);
    if (paragraphMatch) {
      return paragraphMatch[1].trim().substring(0, 500);
    }

    return null;
  }

  private extractTechStack(content: string): TechStack | undefined {
    const techStack: TechStack = {};

    // Look for Tech Stack section
    const techStackMatch = content.match(/(?:##|###)\s+Tech(?:nology)?\s+Stack.+?\n+(.*?)(?:\n##|\n#|$)/is);
    if (!techStackMatch) {
      return undefined;
    }

    const techStackContent = techStackMatch[1];

    // Extract frontend technologies
    const frontendMatch = techStackContent.match(/(?:frontend|client|ui)[:\s-]+(.+?)(?:\n|$)/i);
    if (frontendMatch) {
      techStack.frontend = this.parseTechList(frontendMatch[1]);
    }

    // Extract backend technologies
    const backendMatch = techStackContent.match(/(?:backend|server|api)[:\s-]+(.+?)(?:\n|$)/i);
    if (backendMatch) {
      techStack.backend = this.parseTechList(backendMatch[1]);
    }

    // Extract database technologies
    const databaseMatch = techStackContent.match(/(?:database|db|storage)[:\s-]+(.+?)(?:\n|$)/i);
    if (databaseMatch) {
      techStack.database = this.parseTechList(databaseMatch[1]);
    }

    // Extract testing technologies
    const testingMatch = techStackContent.match(/(?:testing|test)[:\s-]+(.+?)(?:\n|$)/i);
    if (testingMatch) {
      techStack.testing = this.parseTechList(testingMatch[1]);
    }

    return Object.keys(techStack).length > 0 ? techStack : undefined;
  }

  private parseTechList(text: string): string[] {
    // Remove markdown formatting and split by common separators
    return text
      .replace(/\*\*|\*|`/g, '')
      .split(/[,;]|\s+(?:and|with|using)\s+/)
      .map(t => t.trim())
      .filter(t => t.length > 0 && t.length < 50);
  }
}
