import { generateObject } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';

const extractionSchema = z.object({
  summary: z.string().describe('1-2 sentence plain English description'),
  tags: z.array(z.string()).max(5).describe('Relevant tags (e.g. testing, security, performance)'),
  useCase: z.string().describe('When to use this skill (e.g. "Use when writing tests")'),
});

export interface SkillMetadataExtraction {
  summary: string;
  tags: string[];
  useCase: string;
}

export async function extractSkillMetadata(readme: string): Promise<SkillMetadataExtraction> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not set');
  }

  try {
    // Truncate very long READMEs to avoid token limits
    const truncatedReadme = readme.slice(0, 3000);

    const result = await generateObject({
      model: anthropic('claude-haiku-4-5-20251001'),
      schema: extractionSchema,
      prompt: `Extract metadata from this skill README:\n\n${truncatedReadme}\n\nProvide a brief 1-2 sentence summary, relevant tags (max 5), and when to use this skill.`,
      temperature: 0.5,
    });

    return {
      summary: result.object.summary,
      tags: result.object.tags,
      useCase: result.object.useCase,
    };
  } catch (error) {
    // Fallback on extraction failure
    const firstSentence = readme.split('\n').find((line) => line.trim().length > 0) || '';
    return {
      summary: firstSentence.slice(0, 200),
      tags: [],
      useCase: '',
    };
  }
}
