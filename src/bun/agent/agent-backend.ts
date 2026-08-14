import { type Application } from "express";
import {
  existsSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
  readdirSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import OpenAI from "openai";
import { getAgentServerPort } from "../render-media";

// ========== Constants ==========

const APP_DATA_DIR = join(homedir(), "media-studio");
const JSON_DIR = join(APP_DATA_DIR, "json");
const PROJECTS_FILE = join(JSON_DIR, "projects.json");
const AGENTS_DIR = join(APP_DATA_DIR, "agents");
const MEMORIES_DIR_NAME = "memories";

const DEFAULT_MODEL = "mlx-community/gemma-4-E4B-it-bf16";
const MAX_ITERATIONS = 100;

type Role = "system" | "user" | "assistant" | "tool";

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface ChatMessage {
  role: Role;
  content: string | null;
  image?: string;
  tool_call_id?: string;
  name?: string;
  tool_calls?: ToolCall[];
}

// ========== Workspace helpers ==========

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function memoriesDir(projectId: string): string {
  return join(AGENTS_DIR, projectId, MEMORIES_DIR_NAME);
}

// ========== Tools ==========

const TOOLS = [
  {
    type: "function",
    function: {
      name: "get_time",
      description: "Return the current date and time.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_projects",
      description: "List all projects in the studio (name and description).",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_memory",
      description:
        "Write a memory note into the agent's workspace. Use this to remember facts about the user or project.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Short title for the memory" },
          content: {
            type: "string",
            description: "The memory content to store",
          },
        },
        required: ["title", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_memories",
      description:
        "Read back the memory notes the agent has previously saved in the workspace.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
];

async function runTool(
  projectId: string,
  name: string,
  args: string,
): Promise<string> {
  let parsed: Record<string, unknown> = {};
  try {
    parsed = args ? JSON.parse(args) : {};
  } catch {
    // leave empty on malformed args
  }

  switch (name) {
    case "get_time":
      return new Date().toString();
    case "list_projects":
      try {
        if (!existsSync(PROJECTS_FILE)) return "[]";
        const projects = JSON.parse(readFileSync(PROJECTS_FILE, "utf-8"));
        return JSON.stringify(
          (projects as { name: string; description: string }[]).map((p) => ({
            name: p.name,
            description: p.description,
          })),
        );
      } catch (e) {
        return `Error reading projects: ${String(e)}`;
      }
    case "save_memory": {
      const title =
        typeof parsed.title === "string" && parsed.title.trim()
          ? parsed.title.trim()
          : "untitled";
      const content = typeof parsed.content === "string" ? parsed.content : "";
      const dir = memoriesDir(projectId);
      ensureDir(dir);
      const safeTitle = title.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 64);
      const filename = `${safeTitle || "memory"}-${Date.now()}.md`;
      writeFileSync(join(dir, filename), `# ${title}\n\n${content}\n`, "utf-8");
      return `Saved memory "${title}" to ${filename}`;
    }
    case "list_memories": {
      const dir = memoriesDir(projectId);
      if (!existsSync(dir)) return "No memories yet.";
      const entries = readdirSync(dir).filter((e) => e.endsWith(".md"));
      if (entries.length === 0) return "No memories yet.";
      return entries
        .map((e) => `--- ${e} ---\n${readFileSync(join(dir, e), "utf-8")}`)
        .join("\n\n");
    }
    default:
      return `Unknown tool: ${name}`;
  }
}

/** Only accept inline base64 image data URLs (SSRF guard). */
function isValidImageDataUrl(url: string): boolean {
  return /^data:image\/[a-z0-9.+-]+;base64,/i.test(url);
}

/** Convert internal messages into OpenAI-compatible message params. */
function toOpenAIMessages(messages: ChatMessage[]): any[] {
  return messages.map((m) => {
    if (m.role === "tool") {
      return {
        role: "tool",
        tool_call_id: m.tool_call_id,
        content: m.content ?? "",
      };
    }
    if (m.role === "assistant" && m.tool_calls) {
      return {
        role: "assistant",
        content: m.content,
        tool_calls: m.tool_calls,
      };
    }
    if (m.role === "user" && m.image) {
      const parts: any[] = [];
      if (m.content && m.content.trim()) {
        parts.push({ type: "text", text: m.content });
      }
      parts.push({ type: "image_url", image_url: { url: m.image } });
      return { role: "user", content: parts };
    }
    return { role: m.role, content: m.content ?? "" };
  });
}

// ========== Routes ==========

export async function agentBackend({
  app,
  getUvPath: _getUvPath,
}: {
  app: Application;
  getUvPath: () => Promise<string>;
}) {
  // Save user-uploaded images/videos into the agent's workspace.
  app.post("/api/agent/upload", async (req, res) => {
    const { image, filename, projectId } = req.body || {};

    if (!image) {
      res.status(400).json({ error: "File data is required (base64)" });
      return;
    }
    if (!projectId || !/^[a-zA-Z0-9_-]{1,64}$/.test(String(projectId))) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }

    try {
      const base64 = String(image).replace(/^data:[^;]+;base64,/, "");
      const buffer = Buffer.from(base64, "base64");
      const dir = join(AGENTS_DIR, String(projectId));
      ensureDir(dir);
      const safeName = (filename || `upload-${Date.now()}`).replace(
        /[^a-zA-Z0-9._-]/g,
        "_",
      );
      const filePath = join(dir, safeName);
      writeFileSync(filePath, buffer);
      res.json({
        success: true,
        path: filePath,
        filename: safeName,
        size: buffer.length,
      });
    } catch (e) {
      res
        .status(500)
        .json({ error: "Failed to save file", details: String(e) });
    }
  });

  app.post("/api/agent/chat", async (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const send = (event: string, data: object) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const body = req.body || {};

    // Use the port the app itself started the mlx-vlm server on (SSRF guard).
    const port = getAgentServerPort();
    if (port === null) {
      send("error", {
        error:
          "Model server is not running. Start it from the Agent tab first.",
      });
      res.end();
      return;
    }

    const model =
      typeof body.model === "string" && body.model.trim()
        ? body.model.trim()
        : DEFAULT_MODEL;

    const projectId =
      typeof body.projectId === "string" &&
      /^[a-zA-Z0-9_-]{1,64}$/.test(body.projectId)
        ? body.projectId
        : null;
    if (projectId === null) {
      send("error", { error: "Invalid project ID" });
      res.end();
      return;
    }

    const incoming = Array.isArray(body.messages) ? body.messages : [];
    const history: ChatMessage[] = incoming
      .filter((m: any) => m && (m.role === "user" || m.role === "assistant"))
      .map((m: any) => ({
        role: m.role,
        content: typeof m.content === "string" ? m.content : "",
        image:
          typeof m.image === "string" && isValidImageDataUrl(m.image)
            ? m.image
            : undefined,
      }));

    const messages: ChatMessage[] = [
      {
        role: "system",
        content:
          "You are a helpful assistant inside an AI video studio app. Use the available tools when they help answer the user's question. You can save important facts to memory with save_memory and recall them with list_memories.",
      },
      ...history,
    ];

    const client = new OpenAI({
      baseURL: `http://localhost:${port}/v1`,
      apiKey: "local",
    });

    try {
      for (let i = 0; i < MAX_ITERATIONS; i++) {
        const stream = await client.chat.completions.create({
          model,
          messages: toOpenAIMessages(messages),
          tools: TOOLS as any,
          temperature: 0.7,
          stream: true,
        });

        let content = "";
        const toolCalls: {
          id: string;
          function: { name: string; arguments: string };
        }[] = [];

        for await (const chunk of stream) {
          const delta = chunk.choices?.[0]?.delta;
          if (!delta) continue;

          if (delta.content) {
            content += delta.content;
            send("delta", { text: delta.content });
          }

          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const index = tc.index ?? 0;
              if (!toolCalls[index]) {
                toolCalls[index] = {
                  id: tc.id ?? "",
                  function: { name: "", arguments: "" },
                };
              }
              if (tc.id) toolCalls[index].id = tc.id;
              if (tc.function?.name) {
                toolCalls[index].function.name += tc.function.name;
              }
              if (tc.function?.arguments) {
                toolCalls[index].function.arguments += tc.function.arguments;
              }
            }
          }
        }

        // If the model requested tools, run them and feed results back in.
        if (toolCalls.length > 0) {
          messages.push({
            role: "assistant",
            content: content || null,
            tool_calls: toolCalls.map((tc) => ({
              id: tc.id,
              type: "function" as const,
              function: {
                name: tc.function.name,
                arguments: tc.function.arguments,
              },
            })),
          });

          for (const tc of toolCalls) {
            const output = await runTool(
              projectId,
              tc.function.name,
              tc.function.arguments,
            );
            send("tool", {
              name: tc.function.name,
              arguments: tc.function.arguments,
              output,
            });
            messages.push({
              role: "tool",
              tool_call_id: tc.id,
              name: tc.function.name,
              content: output,
            });
          }
          continue;
        }

        // No tool calls → the streamed content is the final answer.
        break;
      }

      send("done", {});
    } catch (e) {
      send("error", { error: String(e) });
    } finally {
      res.end();
    }
  });
}
