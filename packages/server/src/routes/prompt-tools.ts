import { readFile, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
  PromptTool,
  ProviderName,
  SlashCommand,
} from "@yep-anywhere/shared";
import { Hono } from "hono";
import type { Supervisor } from "../supervisor/Supervisor.js";

export interface PromptToolsDeps {
  supervisor: Supervisor;
  codexHomeDir?: string;
}

function slashCommandsToPromptTools(
  provider: ProviderName,
  commands: SlashCommand[],
): PromptTool[] {
  return commands.map((command) => ({
    id: `${provider}:/${command.name}`,
    trigger: "/",
    name: command.name,
    description: command.description,
    argumentHint: command.argumentHint,
    provider,
    source: "sdk",
  }));
}

function getCodexHomeDir(override?: string): string {
  return override ?? process.env.CODEX_HOME ?? join(homedir(), ".codex");
}

function firstMarkdownParagraph(markdown: string): string | undefined {
  const lines = markdown
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("---") && !line.startsWith("#"));
  return lines[0]?.slice(0, 180);
}

async function scanCodexSkills(codexHomeDir: string): Promise<PromptTool[]> {
  const skillsDir = join(codexHomeDir, "skills");
  const entries = await readdir(skillsDir, { withFileTypes: true }).catch(
    () => [],
  );
  const tools: PromptTool[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".")) continue;

    const skillPath = join(skillsDir, entry.name, "SKILL.md");
    const fileStat = await stat(skillPath).catch(() => null);
    if (!fileStat?.isFile()) continue;

    const content = await readFile(skillPath, "utf-8").catch(() => "");
    tools.push({
      id: `codex:$${entry.name}`,
      trigger: "$",
      name: entry.name,
      description: firstMarkdownParagraph(content),
      provider: "codex",
      source: "skill",
    });
  }

  tools.sort((a, b) => a.name.localeCompare(b.name));
  return tools;
}

const CODEX_BUILTIN_SLASH_COMMANDS: Array<{
  name: string;
  description: string;
  argumentHint?: string;
}> = [
  { name: "model", description: "Switch model for this session" },
  { name: "fast", description: "Use the fastest supported model profile" },
  { name: "approvals", description: "Change the approval behavior" },
  { name: "permissions", description: "Change sandbox permissions" },
  { name: "skills", description: "List and inspect available Codex skills" },
  {
    name: "review",
    description: "Review current changes and look for issues",
    argumentHint: "[instructions]",
  },
  { name: "rename", description: "Rename the current conversation" },
  { name: "new", description: "Start a new conversation" },
  { name: "resume", description: "Resume a previous conversation" },
  { name: "fork", description: "Fork the current conversation" },
  { name: "init", description: "Create or update repository instructions" },
  { name: "compact", description: "Compact conversation context" },
  { name: "plan", description: "Toggle plan mode" },
  { name: "collab", description: "Open collaboration controls" },
  { name: "agent", description: "Work with subagents" },
  { name: "subagents", description: "Work with subagents" },
  { name: "copy", description: "Copy the latest assistant response" },
  { name: "diff", description: "Show current repository changes" },
  { name: "mention", description: "Mention a file or app context" },
  { name: "status", description: "Show session and process status" },
  { name: "title", description: "Generate or edit the conversation title" },
  { name: "statusline", description: "Configure the terminal status line" },
  { name: "theme", description: "Change the Codex theme" },
  { name: "mcp", description: "Inspect MCP servers and tools" },
  { name: "apps", description: "Inspect connected apps" },
  { name: "plugins", description: "Inspect installed plugins" },
  { name: "ps", description: "List running Codex tasks" },
  { name: "stop", description: "Stop running background tasks" },
  { name: "clear", description: "Clear visible conversation output" },
  { name: "personality", description: "Change assistant personality" },
  { name: "realtime", description: "Toggle realtime mode" },
  { name: "settings", description: "Open Codex settings" },
  { name: "debug-config", description: "Show Codex debug configuration" },
];

function getBuiltinPromptTools(provider: ProviderName): PromptTool[] {
  if (provider === "codex" || provider === "codex-oss") {
    return CODEX_BUILTIN_SLASH_COMMANDS.map((command) => ({
      id: `${provider}:/${command.name}`,
      trigger: "/",
      name: command.name,
      description: command.description,
      argumentHint: command.argumentHint,
      provider,
      source: "builtin",
    }));
  }

  return [
    {
      id: `${provider}:/model`,
      trigger: "/",
      name: "model",
      description: "Switch model for this session",
      provider,
      source: "builtin",
    },
  ];
}

function dedupePromptTools(tools: PromptTool[]): PromptTool[] {
  const seen = new Set<string>();
  return tools.filter((tool) => {
    const key = `${tool.provider}:${tool.trigger}${tool.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function createPromptToolsRoutes(deps: PromptToolsDeps): Hono {
  const routes = new Hono();

  routes.get("/prompt-tools", async (c) => {
    const provider = c.req.query("provider") as ProviderName | undefined;
    const processId = c.req.query("processId");
    const tools: PromptTool[] = [];

    if (processId) {
      const process = deps.supervisor.getProcess(processId);
      if (process?.supportsDynamicCommands) {
        const commands = await process.supportedCommands();
        if (commands) {
          tools.push(...slashCommandsToPromptTools(process.provider, commands));
        }
      }
      if (process?.provider) {
        tools.push(...getBuiltinPromptTools(process.provider));
      }
      if (process?.provider === "codex" || process?.provider === "codex-oss") {
        tools.push(
          ...(await scanCodexSkills(getCodexHomeDir(deps.codexHomeDir))),
        );
      }
      return c.json({ tools: dedupePromptTools(tools) });
    }

    if (provider === "codex" || provider === "codex-oss") {
      tools.push(...getBuiltinPromptTools(provider));
      tools.push(
        ...(await scanCodexSkills(getCodexHomeDir(deps.codexHomeDir))),
      );
      return c.json({ tools: dedupePromptTools(tools) });
    }

    if (provider) {
      tools.push(...getBuiltinPromptTools(provider));
    }

    return c.json({ tools: dedupePromptTools(tools) });
  });

  routes.get("/processes/:processId/prompt-tools", async (c) => {
    const processId = c.req.param("processId");
    const process = deps.supervisor.getProcess(processId);
    if (!process) {
      return c.json({ error: "Process not found" }, 404);
    }

    const tools: PromptTool[] = [...getBuiltinPromptTools(process.provider)];
    if (process.supportsDynamicCommands) {
      const commands = await process.supportedCommands();
      if (commands) {
        tools.push(...slashCommandsToPromptTools(process.provider, commands));
      }
    }
    if (process.provider === "codex" || process.provider === "codex-oss") {
      tools.push(
        ...(await scanCodexSkills(getCodexHomeDir(deps.codexHomeDir))),
      );
    }
    return c.json({ tools: dedupePromptTools(tools) });
  });

  return routes;
}
