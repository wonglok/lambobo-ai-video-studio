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
const MAX_ITERATIONS = 8;

type Role = "system" | "user" | "assistant";

interface ChatMessage {
  role: Role;
  content: string;
  image?: string;
}

interface Tool {
  name: string;
  description: string;
  run: (input: string) => Promise<string>;
}

// ========== Tools ==========

const TOOLS: Tool[] = [
  {
    name: "get_time",
    description: "Return the current date and time. Input: none.",
    run: async () => new Date().toString(),
  },
  {
    name: "list_projects",
    description:
      "List all projects in the studio (name and description). Input: none.",
    run: async () => {
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
    },
  },
];

// ========== Prompt & parsing ==========

function buildSystemPrompt(): string {
  const toolList = TOOLS.map((t) => `- ${t.name}: ${t.description}`).join("\n");
  return [
    "You are a helpful assistant inside an AI video studio app.",
    "You can use tools to help answer the user's questions.",
    "",
    "Use the following ReAct format to decide when to use a tool:",
    "",
    "Thought: <your reasoning about what to do>",
    "Action: <tool name, or leave blank if no tool is needed>",
    "Action Input: <input for the tool, or leave blank>",
    "",
    "After you call a tool you will receive an Observation. Then continue with",
    "another Thought/Action/Action Input cycle if needed, or give your final answer.",
    "",
    "When you are ready to answer the user, end with:",
    "Final Answer: <your response>",
    "",
    "Available tools:",
    toolList,
    "",
    "If no tool is needed, respond directly with Final Answer.",
  ].join("\n");
}

function parseReAct(text: string): {
  finalAnswer: string | null;
  action: string | null;
  actionInput: string | null;
} {
  const trimmed = text.trim();

  // A "Final Answer:" marker wins regardless of position.
  const finalMatch = trimmed.match(/Final Answer\s*:\s*([\s\S]*)$/i);
  if (finalMatch) {
    return {
      finalAnswer: finalMatch[1].trim(),
      action: null,
      actionInput: null,
    };
  }

  const actionMatch = trimmed.match(/Action\s*:\s*([^\n]+)/i);
  if (actionMatch) {
    const inputMatch = trimmed.match(
      /Action Input\s*:\s*([\s\S]*?)(?=\n(?:Thought|Action|Final Answer)\s*:|$)/i,
    );
    return {
      finalAnswer: null,
      action: actionMatch[1].trim(),
      actionInput: inputMatch ? inputMatch[1].trim() : "",
    };
  }

  // No explicit marker → treat the whole reply as the final answer.
  return { finalAnswer: trimmed, action: null, actionInput: null };
}

// ========== Model call ==========

/**
 * Only accept inline base64 image data URLs. Reject `http(s):`, `file:`, and
 * any other scheme so a client cannot make the model server fetch an arbitrary
 * URL (SSRF).
 */
function isValidImageDataUrl(url: string): boolean {
  return /^data:image\/[a-z0-9.+-]+;base64,/i.test(url);
}

/**
 * Convert internal messages into OpenAI-compatible message params, handling
 * optional image attachments as multimodal content.
 */
function toOpenAIMessages(messages: ChatMessage[]): any[] {
  return messages.map((m) => {
    if (m.image) {
      const parts: any[] = [];
      if (m.content && m.content.trim()) {
        parts.push({ type: "text", text: m.content });
      }
      parts.push({ type: "image_url", image_url: { url: m.image } });
      return { role: m.role, content: parts };
    }
    return { role: m.role, content: m.content };
  });
}

async function callModel(
  port: number,
  model: string,
  messages: ChatMessage[],
): Promise<string> {
  const client = new OpenAI({
    baseURL: `http://localhost:${port}/v1`,
    apiKey: "local",
  });

  const completion = await client.chat.completions.create({
    model,
    messages: toOpenAIMessages(messages),
    temperature: 0.7,
  });

  const content = completion.choices[0]?.message?.content;
  return typeof content === "string" ? content : "";
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

    // Use the port the app itself started the mlx-vlm server on — never trust a
    // client-supplied port, which would otherwise allow probing arbitrary
    // localhost services (SSRF).
    const port = getAgentServerPort();
    if (port === null) {
      send("error", {
        error: "Model server is not running. Start it from the Agent tab first.",
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
      .filter(
        (m: any) =>
          m &&
          (m.role === "user" || m.role === "assistant") &&
          ((typeof m.content === "string" && m.content.trim()) ||
            (typeof m.image === "string" && m.image.trim())),
      )
      .map((m: any) => ({
        role: m.role,
        content: typeof m.content === "string" ? m.content : "",
        image:
          typeof m.image === "string" && isValidImageDataUrl(m.image)
            ? m.image
            : undefined,
      }));

    const messages: ChatMessage[] = [
      { role: "system", content: buildSystemPrompt() },
      ...history,
    ];

    try {
      let finalAnswer: string | null = null;

      for (let i = 0; i < MAX_ITERATIONS; i++) {
        send("step", { text: "Thinking..." });

        const reply = await callModel(port, model, messages);
        messages.push({ role: "assistant", content: reply });

        const parsed = parseReAct(reply);

        if (parsed.finalAnswer !== null) {
          finalAnswer = parsed.finalAnswer;
          break;
        }

        if (parsed.action) {
          const tool = TOOLS.find((t) => t.name === parsed.action);
          if (tool) {
            send("step", { text: `Running tool: ${tool.name}` });

            let output: string;
            try {
              output = await tool.run(parsed.actionInput ?? "");
            } catch (e) {
              output = `Tool error: ${String(e)}`;
            }

            send("tool", {
              name: tool.name,
              input: parsed.actionInput ?? "",
              output,
            });

            messages.push({
              role: "user",
              content: `Observation: ${output}`,
            });
            continue;
          }

          send("tool", {
            name: parsed.action,
            input: parsed.actionInput ?? "",
            output: "Unknown tool",
          });

          messages.push({
            role: "user",
            content: `Observation: Unknown tool "${
              parsed.action
            }". Available tools: ${TOOLS.map((t) => t.name).join(", ")}.`,
          });
          continue;
        }

        // No action and no explicit final answer marker (rare).
        finalAnswer = reply;
        break;
      }

      if (finalAnswer === null) {
        finalAnswer = "I wasn't able to finish within the step limit.";
      }

      send("answer", { text: finalAnswer });
    } catch (e) {
      send("error", { error: String(e) });
    } finally {
      send("done", {});
      res.end();
    }
  });
}
