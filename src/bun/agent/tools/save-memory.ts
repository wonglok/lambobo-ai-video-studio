import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { memoriesDir, ensureDir } from "../workspace";
import type { AgentTool } from "./types";

const tool: AgentTool = {
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

export default tool;
