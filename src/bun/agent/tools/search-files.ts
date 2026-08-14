import { existsSync } from "node:fs";
import { workspaceDir, walkFiles } from "../workspace";
import type { AgentTool } from "./types";

const tool: AgentTool = {
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

export default tool;
