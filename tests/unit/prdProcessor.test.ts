import { PRDProcessor, PRDProcessorError } from '../../src/core/prdProcessor';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';

// Mock the logger
jest.mock('../../src/utils/logger', () => ({
  getLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    success: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  }),
}));

describe('PRDProcessor', () => {
  const processor = new PRDProcessor();
  const testPRDPath = join(__dirname, '../fixtures/test-prd.md');

  beforeAll(() => {
    // Create a test PRD file
    const testPRDContent = `# Test Project

## Overview

This is a test project description for testing the PRD processor.

## Tech Stack

- Frontend: React, TypeScript
- Backend: Node.js, Express
- Database: PostgreSQL

## Features

### Feature 1

Description of feature 1.

### Feature 2

Description of feature 2.
`;
    writeFileSync(testPRDPath, testPRDContent);
  });

  afterAll(() => {
    // Clean up test file
    try {
      unlinkSync(testPRDPath);
    } catch (error) {
      // Ignore errors
    }
  });

  describe('processPRD', () => {
    it('should successfully process a valid PRD file', async () => {
      const result = await processor.processPRD(testPRDPath);

      expect(result).toHaveProperty('title');
      expect(result).toHaveProperty('description');
      expect(result).toHaveProperty('rawContent');
      expect(result.title).toBe('Test Project');
      expect(result.rawContent).toContain('Test Project');
    });

    it('should throw error for non-existent file', async () => {
      await expect(processor.processPRD('/non/existent/file.md')).rejects.toThrow(
        PRDProcessorError
      );
    });

    it('should throw error for empty file', async () => {
      const emptyFilePath = join(__dirname, '../fixtures/empty.md');
      writeFileSync(emptyFilePath, '');

      await expect(processor.processPRD(emptyFilePath)).rejects.toThrow(
        'PRD file is empty'
      );

      unlinkSync(emptyFilePath);
    });

    it('should throw error for file that is too short', async () => {
      const shortFilePath = join(__dirname, '../fixtures/short.md');
      writeFileSync(shortFilePath, '# Short');

      await expect(processor.processPRD(shortFilePath)).rejects.toThrow(
        'PRD file is too short'
      );

      unlinkSync(shortFilePath);
    });
  });
});
