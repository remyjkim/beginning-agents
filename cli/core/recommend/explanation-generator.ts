import type { RankedSkill } from "./query-ranker";
import type { LanguageDetection } from "./repo-detector";
import { colorize, colors } from "../output";

export interface Explanation {
  title: string;
  template: "language_domain" | "language_only" | "domain_only" | "generic" | "popular_choice";
}

const DOMAIN_NAMES: Record<string, string> = {
  testing: "testing",
  security: "security",
  performance: "performance",
  deployment: "deployment",
  documentation: "documentation",
  patterns: "code patterns",
  code_quality: "code quality",
  debugging: "debugging",
  refactoring: "refactoring",
  internationalization: "internationalization",
};

const DOMAIN_DESCRIPTIONS: Record<string, string> = {
  testing: "Helps write and run tests for your code",
  security: "Improves security and audits for vulnerabilities",
  performance: "Optimizes and profiles application performance",
  deployment: "Streamlines deployment and release processes",
  documentation: "Generates and maintains documentation",
  patterns: "Demonstrates code patterns and best practices",
  code_quality: "Enforces code standards and catches issues",
  debugging: "Helps debug and diagnose problems",
  refactoring: "Assists with code restructuring and improvement",
  internationalization: "Handles multi-language and localization",
};

export function generateExplanation(
  skill: RankedSkill & { useCase?: string },
  query: string,
  detection: LanguageDetection
): string {
  // If useCase is available from vector DB extraction, use it
  if ((skill as any).useCase && (skill as any).useCase.length > 0) {
    return (skill as any).useCase;
  }

  const domain = skill.domain ? DOMAIN_NAMES[skill.domain] || skill.domain : null;
  const primaryLang = detection.primary;
  const isLowSemantic = skill.semantic_similarity < 0.6;
  const isHighPopularity = skill.popularity_score > 0.7;

  // Template 1: language + domain
  if (primaryLang && domain && !isLowSemantic) {
    return `Matches "${domain}". Your ${primaryLang} project would benefit from ${skill.name}.`;
  }

  // Template 2: language only (no domain)
  if (primaryLang && !domain && !isLowSemantic) {
    return `Matches "${query}". Your ${primaryLang} project would benefit from ${skill.name}.`;
  }

  // Template 3: domain only (no language detected)
  if (domain && !primaryLang && !isLowSemantic) {
    return `Matches "${domain}". Useful for ${domain} work.`;
  }

  // Template 4: low semantic + high popularity (interesting but not obviously relevant)
  if (isLowSemantic && isHighPopularity) {
    return domain
      ? `Popular choice for ${domain}. May apply to your project.`
      : `Popular skill. May be relevant for "${query}".`;
  }

  // Template 5: generic fallback
  return `Matches "${query}". General utility for your project.`;
}

function getBriefDescription(skill: RankedSkill & { summary?: string }): string {
  // Prefer summary from vector DB extraction (Claude Haiku generated)
  if ((skill as any).summary && (skill as any).summary.length > 0) {
    return (skill as any).summary;
  }

  // Use the skill's actual description (fetched from README)
  // If it looks like a proper description (not just "name from owner"), use it
  if (skill.description && !skill.description.includes(" from ")) {
    return skill.description;
  }

  // Fallback to domain-based description
  if (skill.domain && DOMAIN_DESCRIPTIONS[skill.domain]) {
    return DOMAIN_DESCRIPTIONS[skill.domain]!;
  }

  return `Skill: ${skill.name.replace(/-/g, " ")}`;
}

export function formatSkillResult(
  skill: RankedSkill & { summary?: string; useCase?: string },
  index: number,
  query: string,
  detection: LanguageDetection,
  status: string
): string {
  const explanation = generateExplanation(skill, query, detection);
  const briefDesc = getBriefDescription(skill);

  const nameAndStatus = colorize(`${index}. /${skill.slug}`, colors.cyan) +
    ` ${colorize(`[${status}]`, colors.yellow)}` +
    ` ${colorize(skill.installCount.toLocaleString() + ' downloads', colors.green)}`;

  return (
    `${nameAndStatus}\n` +
    `   ${explanation}\n` +
    `   ${colorize(briefDesc, colors.gray)}`
  );
}
