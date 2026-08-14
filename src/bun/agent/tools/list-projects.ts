import { existsSync, readFileSync } from "node:fs";
import { PROJECTS_FILE } from "../workspace";
import type { AgentTool } from "./types";

const tool: AgentTool = {
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

export default tool;
