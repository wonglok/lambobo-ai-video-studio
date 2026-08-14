import { writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { stringify } from "csv/sync";
import { resolveWorkspacePath, ensureDir } from "../workspace";
import type { AgentTool } from "./types";

const tool: AgentTool = {
  name: "write_csv",
  description:
    "Write a CSV file to the workspace from structured data (an array of rows, each row an array of cell values).",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "File path relative to the workspace (e.g. data.csv)",
      },
      data: {
        type: "array",
        description: "Rows of data; each row is an array of cell values",
        items: {
          type: "array",
          items: { type: "string" },
        },
      },
    },
    required: ["path", "data"],
  },
  run: (args, ctx) => {
    const path = typeof args.path === "string" ? args.path.trim() : "";
    if (!path) return "write_csv requires a path.";

    const data = Array.isArray(args.data) ? args.data : [];
    if (data.length === 0) return "write_csv requires at least one row.";

    const abs = resolveWorkspacePath(ctx.projectId, path);
    if (!abs) return `Invalid path: ${path}`;

    const csvText = stringify(data as any[][]);
    ensureDir(dirname(abs));
    writeFileSync(abs, csvText, "utf-8");

    return `Wrote ${data.length} rows to ${path}`;
  },
};

export default tool;
