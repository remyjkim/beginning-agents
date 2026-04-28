// ABOUTME: Plans and writes Parallel extension project configuration.
// ABOUTME: Keeps Parallel setup semantic without installing or authenticating the external CLI.

import { ensureProjectExtensionConfig, projectConfigPath } from "./project-config";

export interface ParallelSetupOptions {
  projectDir: string;
  skills?: boolean;
  mcp?: boolean;
}

export function buildParallelProjectConfig(options: Pick<ParallelSetupOptions, "skills" | "mcp">) {
  return {
    enabled: true,
    skills: options.skills !== false,
    mcp: options.mcp === true,
  };
}

export function planParallelSetup(options: ParallelSetupOptions) {
  const config = buildParallelProjectConfig(options);
  return {
    projectDir: options.projectDir,
    projectConfigChange: {
      extensionName: "parallel",
      config,
      path: projectConfigPath(options.projectDir),
    },
    warnings: [],
  };
}

export function ensureParallelProjectExtensionConfig(options: ParallelSetupOptions) {
  const config = buildParallelProjectConfig(options);
  return ensureProjectExtensionConfig(options.projectDir, "parallel", config);
}
