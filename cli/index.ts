// ABOUTME: CLI entry point for beginning-harness commands.
// ABOUTME: Sets up Clipanion CLI with all available commands.

import { Cli } from "clipanion";
import { createAgentsContext } from "./context";
import { RecommendCommand } from "./commands/recommend/index";
import { StatusCommand } from "./commands/status";
import { DoctorCommand } from "./commands/doctor";
import { InitCommand } from "./commands/init";
import { ScanCommand } from "./commands/scan";
import { WriteCommand } from "./commands/write";

async function main() {
  const context = createAgentsContext();
  const cli = new Cli({
    binaryLabel: "bgng",
    binaryName: "bgng",
    binaryVersion: "0.1.0",
  });

  cli.register(RecommendCommand);
  cli.register(StatusCommand);
  cli.register(DoctorCommand);
  cli.register(InitCommand);
  cli.register(ScanCommand);
  cli.register(WriteCommand);

  const exitCode = await cli.run(process.argv.slice(2), context);
  process.exit(exitCode);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
