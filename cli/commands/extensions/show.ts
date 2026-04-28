// ABOUTME: Implements bgng extensions show for inspecting one extension definition.
// ABOUTME: Keeps extension details discoverable before setup or sync changes are made.

import { Option, UsageError } from "clipanion";
import { getExtension } from "../../core/extensions/registry";
import { renderJson } from "../../core/output";
import { BaseCommand } from "../base";

export class ExtensionsShowCommand extends BaseCommand {
  static override paths = [["extensions", "show"]];

  static override usage = BaseCommand.Usage({
    category: "Extensions",
    description: "Show one supported extension family.",
  });

  extensionName = Option.String({ required: true });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  async execute() {
    const extension = getExtension(this.extensionName);
    if (!extension) {
      throw new UsageError(`Unknown extension: ${this.extensionName}`);
    }

    if (this.json) {
      this.context.stdout.write(renderJson(extension));
      return 0;
    }

    const lines = [
      `${extension.displayName} (${extension.id})`,
      extension.description,
      `Scopes: ${extension.scopes.join(", ")}`,
      `Modes: ${extension.defaultModes.join(", ")}`,
      `Commands: ${extension.commands.map((command) => `${command.name}${command.required ? "" : " (optional)"}`).join(", ")}`,
      `Skills: ${extension.skills.map((skill) => skill.name).join(", ") || "none"}`,
      `MCP: ${extension.mcpServers.map((server) => server.name).join(", ") || "none"}`,
      "Docs:",
      ...extension.docs.map((doc) => `- ${doc.label}: ${doc.url}`),
    ];
    this.context.stdout.write(`${lines.join("\n")}\n`);
    return 0;
  }
}
