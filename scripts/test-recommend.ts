#!/usr/bin/env bun

import { loadSkillIndex } from "../cli/core/recommend/skill-indexer";
import { detectLanguages } from "../cli/core/recommend/repo-detector";
import { rankSkills } from "../cli/core/recommend/query-ranker";

const homeDir = process.env.HOME || "/Users/jgbae";
const repoRoot = process.cwd();
const query = "testing";

console.log("🔍 Testing recommend skill command...\n");

// Load skills
console.log("📚 Loading skill index...");
const skillIndex = await loadSkillIndex(homeDir, undefined, repoRoot);
console.log(`   ✓ Loaded ${skillIndex.skills.length} skills`);
console.log(`   Bounds: installs [${skillIndex.bounds.installs.min_log.toFixed(2)}, ${skillIndex.bounds.installs.max_log.toFixed(2)}], stars [${skillIndex.bounds.stars.min_log.toFixed(2)}, ${skillIndex.bounds.stars.max_log.toFixed(2)}]\n`);

// Detect language
console.log("🌐 Detecting languages...");
const detection = detectLanguages(repoRoot);
console.log(`   Primary: ${detection.primary} (confidence: ${detection.confidence})`);
console.log(`   Languages: ${JSON.stringify(detection.languages)}\n`);

// Rank skills
console.log(`🎯 Ranking for query: "${query}"...`);
const result = await rankSkills(skillIndex.skills, query, skillIndex.bounds, detection);
console.log(`   Embedding failed: ${result.embeddingFailed}`);
console.log(`   Results: ${result.results.length} skills\n`);

if (result.results.length > 0) {
  console.log("Top results:");
  result.results.forEach((skill, i) => {
    console.log(
      `${i + 1}. ${skill.slug} - Score: ${(skill.score * 100).toFixed(0)}% ` +
      `(semantic: ${(skill.semantic_similarity * 100).toFixed(0)}%, ` +
      `popularity: ${(skill.popularity_score * 100).toFixed(0)}%, ` +
      `language: ${(skill.language_match * 100).toFixed(0)}%)`
    );
  });
} else {
  console.log("❌ No matching skills found");

  // Debug: show all skills with their scores
  console.log("\n📊 Debug: All skills in ranking:");
  for (const skill of skillIndex.skills.slice(0, 3)) {
    const popularity = 0; // Would calculate here
    const language = detection.primary && skill.languages.includes(detection.primary) ? 1.0 : 0;
    console.log(`   ${skill.slug}: domain="${skill.domain}", languages=${skill.languages}, language_match=${language}`);
  }
}
