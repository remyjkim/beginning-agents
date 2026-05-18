// ABOUTME: Exposes the public skill recommendation pipeline API and CLI command.
// ABOUTME: Keeps imports stable for future CLI integration and Phase 2 reranking.

export { RecommendCommand } from "./command";
export { buildQueryGeneratorPrompt, DEFAULT_MASTRA_QUERY_CONFIG, PRODUCTION_MASTRA_QUERY_CONFIG, QUERY_GENERATOR_SYSTEM_PROMPT } from "./prompts";
export { coerceQueryList, fallbackQueries, generateQueries } from "./query-generator";
export { parseSkillFinderOutput, findSkills } from "./skill-finder";
export { aggregateSkills } from "./skill-aggregator";
export { extractProjectContext } from "./extractors";
export { createBufferedLogger } from "./logger";
export { OpenRouterMastraTextClient } from "./openrouter-client";
export { recommendSkills, recommendSkillsWithOpenRouter } from "./pipeline";
export type { OpenRouterMastraTextClientOptions } from "./openrouter-client";
export type {
  LogLevel,
  MastraQueryGeneratorConfig,
  MastraTextClient,
  ProjectContext,
  QueryGeneratorInput,
  QueryGeneratorOutput,
  RuntimeDetection,
  Skill,
  SkillFinderInput,
  SkillFinderOutput,
  SkillRecommendationLogger,
  SkillRecommendationResult,
} from "./types";
