import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { memoriesDir } from "../workspace";
import type { AgentTool } from "./types";

const tool: AgentTool = {
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

export default tool;
