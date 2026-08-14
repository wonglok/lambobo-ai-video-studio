import { type Application } from "express";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
  rmSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { spawn } from "bun";
import OpenAI from "openai";
import { getAgentServerPort } from "../render-media";
import {
  workspaceDir,
  resolveWorkspacePath,
  walkFiles,
  classifyFile,
  ensureDir,
} from "./workspace";
import { TOOLS, toolDefinitions, runTool } from "./tools";

// ========== Constants ==========

const DEFAULT_MODEL = "mlx-community/gemma-4-e2b-it-4bit";
const MAX_ITERATIONS = 500;

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

/** Build the system prompt, listing every tool and its description. */
function buildSystemPrompt(): string {
  const toolList = TOOLS.map((t) => `- ${t.name}: ${t.description}`).join("\n");
  return [
    "You are a helpful assistant that uses tools to help the user achieve their goal.",
    "",
    "Available tools:",
    toolList,
    "",
    "Rules:",
    "- Call a tool only when you actually need its result. Once you have enough information, answer the user directly WITHOUT calling any tool.",
    "- Do not call the same tool twice with the same arguments.",
  ].join("\n");
}

/** Build a sanitized trace of the conversation for the client (no secrets/system). */
function sanitizeTrace(messages: ChatMessage[]): any[] {
  return messages
    .filter((m) => m.role !== "system")
    .map((m) => {
      if (m.role === "tool") {
        const text = typeof m.content === "string" ? m.content : "";
        return {
          role: "tool",
          name: m.name ?? "",
          content: text.length > 500 ? `${text.slice(0, 500)}…` : text,
        };
      }
      const out: any = { role: m.role, content: m.content ?? "" };
      if (m.tool_calls) out.tool_calls = m.tool_calls;
      if (m.image) out.image = "(image)";
      return out;
    });
}

// ========== Routes ==========

export async function agentBackend({
  app,
  getUvPath: _getUvPath,
  backendPort,
}: {
  app: Application;
  getUvPath: () => Promise<string>;
  backendPort: number;
}) {
  // ===== Workspace file manager =====

  app.get("/api/agent/files", (req, res) => {
    const projectId = String(req.query.projectId ?? "");
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(projectId)) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }
    const base = workspaceDir(projectId);
    if (!existsSync(base)) {
      res.json({ files: [] });
      return;
    }
    res.json({ files: walkFiles(base) });
  });

  app.get("/api/agent/file/content", (req, res) => {
    const projectId = String(req.query.projectId ?? "");
    const path = String(req.query.path ?? "");
    const abs = resolveWorkspacePath(projectId, path);
    if (!abs || !existsSync(abs)) {
      res.status(404).json({ error: "File not found" });
      return;
    }
    res.json({ content: readFileSync(abs, "utf-8") });
  });

  app.post("/api/agent/file/content", (req, res) => {
    const { projectId, path, content } = req.body || {};
    const abs = resolveWorkspacePath(projectId, path);
    if (!abs) {
      res.status(400).json({ error: "Invalid path" });
      return;
    }
    ensureDir(dirname(abs));
    writeFileSync(abs, String(content ?? ""), "utf-8");
    res.json({ ok: true });
  });

  app.post("/api/agent/rename", (req, res) => {
    const { projectId, path, newName } = req.body || {};
    const abs = resolveWorkspacePath(projectId, path);
    const newAbs = resolveWorkspacePath(projectId, newName);
    if (!abs || !newAbs) {
      res.status(400).json({ error: "Invalid path" });
      return;
    }
    if (!existsSync(abs)) {
      res.status(404).json({ error: "File not found" });
      return;
    }
    ensureDir(dirname(newAbs));
    renameSync(abs, newAbs);
    res.json({ ok: true });
  });

  app.post("/api/agent/delete", (req, res) => {
    const { projectId, path } = req.body || {};
    const abs = resolveWorkspacePath(projectId, path);
    if (!abs) {
      res.status(400).json({ error: "Invalid path" });
      return;
    }
    if (!existsSync(abs)) {
      res.status(404).json({ error: "File not found" });
      return;
    }
    rmSync(abs, { recursive: true, force: true });
    res.json({ ok: true });
  });

  app.get("/api/agent/file/preview", (req, res) => {
    const projectId = String(req.query.projectId ?? "");
    const path = String(req.query.path ?? "");
    const abs = resolveWorkspacePath(projectId, path);
    if (!abs || !existsSync(abs)) {
      res.status(404).json({ error: "File not found" });
      return;
    }
    // Only serve non-executable media; block HTML/SVG/JS/etc. to prevent
    // stored XSS from being served in the app's origin.
    const kind = classifyFile(path);
    if (kind !== "image" && kind !== "video") {
      res
        .status(415)
        .json({ error: "Preview only supports images and videos" });
      return;
    }
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "sandbox");
    res.sendFile(abs);
  });

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
      const dir = workspaceDir(String(projectId));
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

  app.post("/api/agent/open-workspace", (req, res) => {
    const { projectId } = req.body || {};
    if (!projectId || !/^[a-zA-Z0-9_-]{1,64}$/.test(String(projectId))) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }
    const dir = workspaceDir(String(projectId));
    ensureDir(dir);
    spawn(["open", dir], { stdout: "ignore", stderr: "ignore" });
    res.json({ ok: true });
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
    const history: ChatMessage[] = incoming.map((m: any) => ({
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

    const client = new OpenAI({
      baseURL: `http://localhost:${port}/v1`,
      apiKey: "local",
    });

    const abortController = new AbortController();

    let ttt = setInterval(() => {
      if (req?.signal?.aborted) {
        clearInterval(ttt);
        abortController.abort();
      }
    });

    // res.on("close", () => abortController.abort());

    try {
      const seenToolKeys = new Set<string>();
      let streamedAny = false;

      for (let i = 0; i < MAX_ITERATIONS; i++) {
        const stream = await client.chat.completions.create(
          {
            model,
            messages: toOpenAIMessages(messages),
            tools: toolDefinitions(TOOLS),
            tool_choice: "auto",
            temperature: 0.7,
            reasoning_effort: "high",
            stream: true,
          },
          { signal: abortController.signal },
        );

        let content = "";
        const toolCalls: {
          id: string;
          function: { name: string; arguments: string };
        }[] = [];

        for await (const chunk of stream) {
          const choice = chunk.choices?.[0];
          const delta = choice?.delta;
          if (!delta) continue;

          if (delta.content) {
            content += delta.content;
            send("delta", { text: delta.content });
            streamedAny = true;
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
          const toolKey = toolCalls
            .map((tc) => `${tc.function.name}:${tc.function.arguments}`)
            .join("||");
          if (toolKey && seenToolKeys.has(toolKey)) {
            // Stuck repeating a tool call — stop.
            break;
          }
          if (toolKey) seenToolKeys.add(toolKey);

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
              TOOLS,
              tc.function.name,
              tc.function.arguments,
              {
                projectId,
                emit: send,
                backendPort,
                signal: abortController.signal,
              },
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

      if (!streamedAny) {
        send("delta", { text: "Done." });
      }
      send("messages", { messages: sanitizeTrace(messages) });
      send("done", {});
    } catch (e) {
      send("error", { error: String(e) });
    } finally {
      res.end();
    }
  });
}
