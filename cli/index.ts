#!/usr/bin/env bun
// ABOUTME: CLI entrypoint that creates the Clipanion application and runs it.
// ABOUTME: All command registration starts here; reusable logic lives outside the command layer.

import { Builtins, Cli } from "clipanion";
import { AddExtensionCommand } from "./commands/add/extension";
import { AddMcpCommand } from "./commands/add/mcp";
import { AddSkillCommand } from "./commands/add/skill";
import { ApplyCommand } from "./commands/apply";
import { DoctorCommand } from "./commands/doctor";
import { InitCommand } from "./commands/init";
import { createAgentsContext, validateRepoRoot } from "./context";
import { ExtensionsDoctorCommand } from "./commands/extensions/doctor";
import { ExtensionsListCommand } from "./commands/extensions/list";
import { ExtensionsSetupCommand } from "./commands/extensions/setup";
import { ExtensionsShowCommand } from "./commands/extensions/show";
import { ExtensionsStatusCommand } from "./commands/extensions/status";
import { LibraryAddSkillCommand } from "./commands/library/add/skill";
import { LibraryAddMcpCommand } from "./commands/library/add/mcp";
import { LibraryDefaultsAddMcpCommand } from "./commands/library/defaults/add-mcp";
import { LibraryDefaultsAddSkillCommand } from "./commands/library/defaults/add-skill";
import { LibraryDefaultsListCommand } from "./commands/library/defaults/list";
import { LibraryDefaultsRemoveMcpCommand } from "./commands/library/defaults/remove-mcp";
import { LibraryDefaultsRemoveSkillCommand } from "./commands/library/defaults/remove-skill";
import { LibraryListCommand } from "./commands/library/list";
import { LibraryShowCommand } from "./commands/library/show";
import { McpApplyCommand } from "./commands/mcp/apply";
import { McpListCommand } from "./commands/mcp/list";
import { McpSyncCommand } from "./commands/mcp/sync";
import { SearchMcpCommand } from "./commands/search/mcp";
import { SearchSkillCommand } from "./commands/search/skill";
import { SyncCommand } from "./commands/sync";
import { StatusCommand } from "./commands/status";
import { SkillsCurateCommand } from "./commands/skills/curate";
import { SkillsListCommand } from "./commands/skills/list";
import { SkillsPackagesAddCommand } from "./commands/skills/packages/add";
import { SkillsPackagesListCommand } from "./commands/skills/packages/list";
import { SkillsPackagesShowCommand } from "./commands/skills/packages/show";
import { SkillsSyncCommand } from "./commands/skills/sync";
import { SkillsUncurateCommand } from "./commands/skills/uncurate";

const cli = new Cli({
  binaryLabel: "bgng",
  binaryName: "bgng",
  binaryVersion: "0.1.0",
});

cli.register(SkillsListCommand);
cli.register(SkillsPackagesAddCommand);
cli.register(SkillsPackagesListCommand);
cli.register(SkillsPackagesShowCommand);
cli.register(SkillsCurateCommand);
cli.register(SkillsUncurateCommand);
cli.register(SkillsSyncCommand);
cli.register(AddExtensionCommand);
cli.register(AddSkillCommand);
cli.register(AddMcpCommand);
cli.register(LibraryAddSkillCommand);
cli.register(LibraryAddMcpCommand);
cli.register(LibraryDefaultsListCommand);
cli.register(LibraryDefaultsAddSkillCommand);
cli.register(LibraryDefaultsRemoveSkillCommand);
cli.register(LibraryDefaultsAddMcpCommand);
cli.register(LibraryDefaultsRemoveMcpCommand);
cli.register(LibraryListCommand);
cli.register(LibraryShowCommand);
cli.register(SearchSkillCommand);
cli.register(SearchMcpCommand);
cli.register(ExtensionsListCommand);
cli.register(ExtensionsShowCommand);
cli.register(ExtensionsStatusCommand);
cli.register(ExtensionsDoctorCommand);
cli.register(ExtensionsSetupCommand);
cli.register(McpApplyCommand);
cli.register(McpListCommand);
cli.register(McpSyncCommand);
cli.register(ApplyCommand);
cli.register(SyncCommand);
cli.register(StatusCommand);
cli.register(DoctorCommand);
cli.register(InitCommand);
cli.register(Builtins.HelpCommand);
cli.register(Builtins.VersionCommand);

const context = createAgentsContext();

try {
  validateRepoRoot(context.repoRoot);
  await cli.runExit(process.argv.slice(2), context);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
