// ABOUTME: Infers application frameworks from dependency manifests.
// ABOUTME: Reuses dependency parsing so framework detection remains manifest-only and quick.

import { parseExistingPackages } from "./dependency-parser";

const FRAMEWORK_PACKAGES: Record<string, string> = {
  "@angular/core": "Angular",
  "@nestjs/core": "NestJS",
  "@remix-run/react": "Remix",
  "@sveltejs/kit": "SvelteKit",
  "@vue/runtime-core": "Vue",
  astro: "Astro",
  django: "Django",
  express: "Express",
  fastapi: "FastAPI",
  flask: "Flask",
  gin: "Gin",
  "github.com/gin-gonic/gin": "Gin",
  next: "Next.js",
  rails: "Rails",
  react: "React",
  remix: "Remix",
  svelte: "Svelte",
  vue: "Vue",
};

export async function detectFrameworks(repoPath: string): Promise<string[]> {
  const packages = await parseExistingPackages(repoPath);
  const packageSet = new Set(packages.map((name) => name.toLowerCase()));
  const frameworks = new Set<string>();

  for (const [packageName, framework] of Object.entries(FRAMEWORK_PACKAGES)) {
    if (packageSet.has(packageName.toLowerCase())) frameworks.add(framework);
  }

  return [...frameworks].sort((a, b) => a.localeCompare(b));
}
