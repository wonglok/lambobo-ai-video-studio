import {
  existsSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { join, dirname } from "node:path";
import {
  PROJECTS_FILE,
  ensureDir,
  workspaceDir,
  memoriesDir,
  resolveWorkspacePath,
  classifyFile,
  walkFiles,
} from "../workspace";

export interface ToolRunContext {
  projectId: string;
}

export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  run: (
    args: Record<string, unknown>,
    ctx: ToolRunContext,
  ) => string | Promise<string>;
}

const getTimeTool: AgentTool = {
  name: "get_time",
  description: "Return the current date and time.",
  parameters: { type: "object", properties: {}, additionalProperties: false },
  run: () => new Date().toString(),
};

const listProjectsTool: AgentTool = {
  name: "list_projects",
  description: "List all projects in the studio (name and description).",
  parameters: { type: "object", properties: {}, additionalProperties: false },
  run: () => {
    if (!existsSync(PROJECTS_FILE)) return "[]";
    const projects = JSON.parse(readFileSync(PROJECTS_FILE, "utf-8"));
    return JSON.stringify(
      (projects as { name: string; description: string }[]).map((p) => ({
        name: p.name,
        description: p.description,
      })),
    );
  },
};

const saveMemoryTool: AgentTool = {
  name: "save_memory",
  description:
    "Write a memory note into the agent's workspace. Use this to remember facts about the user or project.",
  parameters: {
    type: "object",
    properties: {
      title: { type: "string", description: "Short title for the memory" },
      content: { type: "string", description: "The memory content to store" },
    },
    required: ["title", "content"],
  },
  run: (args, ctx) => {
    const title =
      typeof args.title === "string" && args.title.trim()
        ? args.title.trim()
        : "untitled";
    const content = typeof args.content === "string" ? args.content : "";
    const dir = memoriesDir(ctx.projectId);
    ensureDir(dir);
    const safeTitle = title.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 64);
    const filename = `${safeTitle || "memory"}-${Date.now()}.md`;
    writeFileSync(join(dir, filename), `# ${title}\n\n${content}\n`, "utf-8");
    return `Saved memory "${title}" to ${filename}`;
  },
};

const listMemoriesTool: AgentTool = {
  name: "list_memories",
  description:
    "Read back the memory notes the agent has previously saved in the workspace.",
  parameters: { type: "object", properties: {}, additionalProperties: false },
  run: (_args, ctx) => {
    const dir = memoriesDir(ctx.projectId);
    if (!existsSync(dir)) return "No memories yet.";
    const entries = readdirSync(dir).filter((e) => e.endsWith(".md"));
    if (entries.length === 0) return "No memories yet.";
    return entries
      .map((e) => `--- ${e} ---\n${readFileSync(join(dir, e), "utf-8")}`)
      .join("\n\n");
  },
};

const listFilesTool: AgentTool = {
  name: "list_files",
  description: "List all files in the agent's workspace (recursive).",
  parameters: { type: "object", properties: {}, additionalProperties: false },
  run: (_args, ctx) => {
    const base = workspaceDir(ctx.projectId);
    if (!existsSync(base)) return "Workspace is empty.";
    const files = walkFiles(base);
    if (files.length === 0) return "Workspace is empty.";
    return JSON.stringify(
      files.map((f) => ({ path: f.path, kind: f.kind, size: f.size })),
    );
  },
};

const readFileTool: AgentTool = {
  name: "read_file",
  description: "Read the text content of a file in the workspace.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "File path relative to the workspace (e.g. memories/foo.md)",
      },
    },
    required: ["path"],
  },
  run: (args, ctx) => {
    const path = typeof args.path === "string" ? args.path : "";
    const abs = resolveWorkspacePath(ctx.projectId, path);
    if (!abs || !existsSync(abs)) return `File not found: ${path}`;
    const kind = classifyFile(path);
    if (kind === "image" || kind === "video") {
      return `Cannot read binary file: ${path}`;
    }
    return readFileSync(abs, "utf-8");
  },
};

const writeFileTool: AgentTool = {
  name: "write_file",
  description: "Write (create or overwrite) a file with the given text content.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path relative to the workspace" },
      content: { type: "string", description: "Text content to write" },
    },
    required: ["path", "content"],
  },
  run: (args, ctx) => {
    const path = typeof args.path === "string" ? args.path : "";
    const content = typeof args.content === "string" ? args.content : "";
    const abs = resolveWorkspacePath(ctx.projectId, path);
    if (!abs) return `Invalid path: ${path}`;
    ensureDir(dirname(abs));
    writeFileSync(abs, content, "utf-8");
    return `Wrote ${content.length} chars to ${path}`;
  },
};

const updateFileTool: AgentTool = {
  name: "update_file",
  description: "Append text to the end of a file in the workspace.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path relative to the workspace" },
      content: { type: "string", description: "Text content to append" },
    },
    required: ["path", "content"],
  },
  run: (args, ctx) => {
    const path = typeof args.path === "string" ? args.path : "";
    const content = typeof args.content === "string" ? args.content : "";
    const abs = resolveWorkspacePath(ctx.projectId, path);
    if (!abs) return `Invalid path: ${path}`;
    ensureDir(dirname(abs));
    const existing = existsSync(abs) ? readFileSync(abs, "utf-8") : "";
    writeFileSync(abs, existing + content, "utf-8");
    return `Appended ${content.length} chars to ${path}`;
  },
};

const removeFileTool: AgentTool = {
  name: "remove_file",
  description: "Delete a file (or directory) in the workspace.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path relative to the workspace" },
    },
    required: ["path"],
  },
  run: (args, ctx) => {
    const path = typeof args.path === "string" ? args.path : "";
    const abs = resolveWorkspacePath(ctx.projectId, path);
    if (!abs || !existsSync(abs)) return `File not found: ${path}`;
    rmSync(abs, { recursive: true, force: true });
    return `Removed ${path}`;
  },
};

const grepFilesTool: AgentTool = {
  name: "grep_files",
  description: "Search for a regex pattern within text files in the workspace.",
  parameters: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Regular expression to search for" },
      path: {
        type: "string",
        description: "Optional directory to search (defaults to the whole workspace)",
      },
    },
    required: ["pattern"],
  },
  run: (args, ctx) => {
    const pattern = typeof args.pattern === "string" ? args.pattern : "";
    if (!pattern) return "grep_files requires a pattern.";
    let re: RegExp;
    try {
      re = new RegExp(pattern, "i");
    } catch {
      return `Invalid regex: ${pattern}`;
    }

    const dirArg =
      typeof args.path === "string" && args.path.trim() ? args.path.trim() : "";
    const base = dirArg
      ? resolveWorkspacePath(ctx.projectId, dirArg)
      : workspaceDir(ctx.projectId);
    if (!base || !existsSync(base)) {
      return `Directory not found: ${dirArg || "(workspace)"}`;
    }

    const results: string[] = [];
    for (const f of walkFiles(base)) {
      if (f.kind !== "text") continue;
      const abs = join(base, f.path);
      let content: string;
      try {
        content = readFileSync(abs, "utf-8");
      } catch {
        continue;
      }
      content.split("\n").forEach((line, i) => {
        if (re.test(line)) {
          results.push(`${f.path}:${i + 1}: ${line.trim()}`);
        }
      });
    }
    return results.length > 0
      ? results.join("\n")
      : `No matches for "${pattern}".`;
  },
};

const searchFilesTool: AgentTool = {
  name: "search_files",
  description: "Search for files by name (case-insensitive substring match).",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Substring to match against file paths" },
    },
    required: ["query"],
  },
  run: (args, ctx) => {
    const query = typeof args.query === "string" ? args.query.toLowerCase() : "";
    if (!query) return "search_files requires a query.";
    const base = workspaceDir(ctx.projectId);
    if (!existsSync(base)) return "Workspace is empty.";
    const matches = walkFiles(base)
      .map((f) => f.path)
      .filter((p) => p.toLowerCase().includes(query));
    return matches.length > 0 ? matches.join("\n") : `No files match "${query}".`;
  },
};

export const TOOLS: AgentTool[] = [
  getTimeTool,
  listProjectsTool,
  saveMemoryTool,
  listMemoriesTool,
  listFilesTool,
  readFileTool,
  writeFileTool,
  updateFileTool,
  removeFileTool,
  grepFilesTool,
  searchFilesTool,
];

/** Build the OpenAI `tools` array from the tool objects. */
export function toolDefinitions(tools: AgentTool[]): any[] {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

/** Dispatch a tool call to the matching tool's `run` function. */
export async function runTool(
  tools: AgentTool[],
  name: string,
  args: string,
  ctx: ToolRunContext,
): Promise<string> {
  const tool = tools.find((t) => t.name === name);
  if (!tool) return `Unknown tool: ${name}`;

  let parsed: Record<string, unknown> = {};
  try {
    parsed = args ? JSON.parse(args) : {};
  } catch {
    // leave empty on malformed args
  }

  try {
    const out = await tool.run(parsed, ctx);
    return typeof out === "string" ? out : String(out);
  } catch (e) {
    return `Tool error: ${String(e)}`;
  }
}
