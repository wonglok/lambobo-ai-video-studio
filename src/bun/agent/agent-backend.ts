import { type Application } from "express";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import OpenAI from "openai";
import { getAgentServerPort } from "../render-media";

// ========== Constants ==========

const APP_DATA_DIR = join(homedir(), "media-studio");
const JSON_DIR = join(APP_DATA_DIR, "json");
const PROJECTS_FILE = join(JSON_DIR, "projects.json");

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
];

async function runTool(name: string, _args: string): Promise<string> {
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
          "You are a helpful assistant inside an AI video studio app. Use the available tools when they help answer the user's question.",
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
