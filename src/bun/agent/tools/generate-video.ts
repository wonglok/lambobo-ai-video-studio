import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  isValidProjectId,
  resolveWorkspacePath,
  classifyFile,
  UPLOAD_DIR,
  workspaceDir,
} from "../workspace";
import type { AgentTool } from "./types";

async function readSSE(
  response: Response,
  onEvent: (event: string, data: any) => void,
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      let eventType = "message";
      for (const line of lines) {
        if (line.startsWith("event: ")) {
          eventType = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          try {
            onEvent(eventType, JSON.parse(line.slice(6)));
          } catch {
            // skip malformed lines
          }
          eventType = "message";
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

const tool: AgentTool = {
  name: "generate_video",
  description: "Generate a video from a prompt and an image in the workspace.",
  parameters: {
    type: "object",
    properties: {
      prompt: { type: "string", description: "The video prompt" },
      image: {
        type: "string",
        description: "Path of the image in the workspace to animate",
      },
      duration: {
        type: "number",
        description: "Video duration in seconds (default 5)",
      },
    },
    required: ["prompt", "image"],
  },
  run: async (args, ctx) => {
    if (!isValidProjectId(ctx.projectId)) return "Invalid project ID.";

    const prompt = typeof args.prompt === "string" ? args.prompt.trim() : "";
    if (!prompt) return "generate_video requires a prompt.";

    const image = typeof args.image === "string" ? args.image.trim() : "";
    if (!image) return "generate_video requires an image from the workspace.";

    const abs = resolveWorkspacePath(ctx.projectId, image);
    if (!abs || !existsSync(abs) || classifyFile(image) !== "image") {
      return `Image not found or not an image: ${image}`;
    }

    if (!ctx.backendPort) return "Video backend not available.";

    const duration =
      typeof args.duration === "number" && args.duration > 0
        ? args.duration
        : 5;
    const frames = Math.round(duration * 24 + 1);

    // Copy the image into the project's upload dir so the video endpoint can
    // resolve it by bare filename.
    const uploadProjectDir = join(UPLOAD_DIR, ctx.projectId);
    if (!existsSync(uploadProjectDir)) {
      mkdirSync(uploadProjectDir, { recursive: true });
    }
    const origName = image.split("/").pop() || "image.png";
    const imageName = `agent-${Date.now()}-${origName.replace(
      /[^a-zA-Z0-9._-]/g,
      "_",
    )}`;
    writeFileSync(join(uploadProjectDir, imageName), readFileSync(abs));

    ctx.emit?.("notice", { text: `Generating video from "${image}"...` });

    try {
      const res = await fetch(
        `http://localhost:${ctx.backendPort}/api/render/image-to-video`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt,
            imagePath: imageName,
            projectId: ctx.projectId,
            outputDir: workspaceDir(ctx.projectId),
            width: 480,
            height: 480,
            frames,
            frameRate: 24,
          }),
          signal: ctx.signal,
        },
      );

      if (!res.ok) {
        return `Video generation failed: ${await res.text()}`;
      }

      let resultPath: string | null = null;
      let error: string | null = null;

      await readSSE(res, (event, data) => {
        switch (event) {
          case "log":
            ctx.emit?.("notice", { text: data.text as string });
            break;
          case "complete":
            resultPath = data.path as string;
            break;
          case "error":
            error = data.error || "Video generation failed";
            break;
        }
      });

      if (error) return error;
      if (!resultPath) return "Video generation did not produce a result.";

      const url = `/api/files?path=${encodeURIComponent(resultPath)}`;
      ctx.emit?.("video", { url });

      return `Generated video from "${image}": ${resultPath}`;
    } catch (e) {
      return `Video generation error: ${String(e)}`;
    }
  },
};

export default tool;
