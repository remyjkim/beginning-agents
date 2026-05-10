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
  testing: "Provides utilities for automated testing and test execution",
  security: "Enhances security posture and identifies vulnerabilities",
  performance: "Analyzes and optimizes application performance characteristics",
  deployment: "Facilitates deployment processes and release management",
  documentation: "Generates, maintains, and publishes documentation",
  patterns: "Demonstrates architectural patterns and industry best practices",
  code_quality: "Enforces code standards and identifies code quality issues",
  debugging: "Assists with debugging workflows and problem diagnosis",
  refactoring: "Facilitates code restructuring and architectural improvements",
  internationalization: "Provides support for localization and multi-language applications",
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
    return `Recommended for ${domain} in ${primaryLang} projects.`;
  }

  // Template 2: language only (no domain)
  if (primaryLang && !domain && !isLowSemantic) {
    return `Addresses "${query}" concerns and is applicable to ${primaryLang} projects.`;
  }

  // Template 3: domain only (no language detected)
  if (domain && !primaryLang && !isLowSemantic) {
    return `Addresses ${domain} concerns and is relevant to related development tasks.`;
  }

  // Template 4: low semantic + high popularity (interesting but not obviously relevant)
  if (isLowSemantic && isHighPopularity) {
    return domain
      ? `Widely adopted for ${domain}. May provide value in related contexts.`
      : `Widely adopted skill. May provide value for projects matching "${query}" criteria.`;
  }

  // Template 5: generic fallback
  return `Addresses "${query}" concerns and provides general utility for projects.`;
}

function cleanDescription(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function getBriefDescription(skill: RankedSkill & { summary?: string }): string {
  // Prefer summary from vector DB extraction (Claude Haiku generated)
  if ((skill as any).summary && (skill as any).summary.length > 0) {
    return cleanDescription((skill as any).summary);
  }

  // Use the skill's actual description (fetched from README)
  // If it looks like a proper description (not just "name from owner"), use it
  if (skill.description && !skill.description.includes(" from ")) {
    return cleanDescription(skill.description);
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
  const briefDesc = getBriefDescription(skill);

  const nameAndStatus = colorize(`${index}. /${skill.slug}`, colors.cyan) +
    ` ${colorize(`[${status}]`, colors.yellow)}` +
    ` ${colorize(skill.installCount.toLocaleString() + ' downloads', colors.green)}`;

  return (
    `${nameAndStatus}\n` +
    `   ${colorize(briefDesc, colors.gray)}`
  );
}
