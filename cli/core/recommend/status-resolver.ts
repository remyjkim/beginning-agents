import { existsSync } from "fs";
import { join } from "path";

export type SkillStatus = "active" | "offline" | "online";

export function resolveSkillStatus(
  skillSlug: string,
  homeDir: string,
  isFromCache: boolean,
  isFreshFromApi: boolean
): { status: SkillStatus; label: string } {
  // Check if skill is installed locally
  const skillPath = join(homeDir, ".claude", "skills", skillSlug);
  if (existsSync(skillPath)) {
    return {
      status: "active",
      label: "[active]",
    };
  }

  // Determine if offline or online based on data freshness
  if (isFreshFromApi) {
    return {
      status: "online",
      label: "[online]",
    };
  }

  if (isFromCache) {
    return {
      status: "offline",
      label: "[offline]",
    };
  }

  // Default to offline if unknown
  return {
    status: "offline",
    label: "[offline]",
  };
}

export function formatStatusLabel(status: SkillStatus): string {
  const statusMap: Record<SkillStatus, string> = {
    active: "[active]",
    offline: "[offline]",
    online: "[online]",
  };
  return statusMap[status];
}
