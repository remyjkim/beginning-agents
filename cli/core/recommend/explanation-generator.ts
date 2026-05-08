import { RankedSkill } from "./query-ranker";
import { LanguageDetection } from "./repo-detector";

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

export function generateExplanation(
  skill: RankedSkill,
  query: string,
  detection: LanguageDetection
): string {
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

export function formatSkillResult(
  skill: RankedSkill,
  index: number,
  query: string,
  detection: LanguageDetection,
  status: string
): string {
  const explanation = generateExplanation(skill, query, detection);
  const scorePercent = Math.round(skill.score * 100);

  return (
    `${index}. /${skill.slug} ${status}\n` +
    `   ${explanation}\n` +
    `   Score: ${scorePercent}% | ${skill.installCount.toLocaleString()} installs | ⭐ ${skill.githubStars}`
  );
}
