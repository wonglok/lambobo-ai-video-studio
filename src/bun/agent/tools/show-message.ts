import type { AgentTool } from "./types";

const tool: AgentTool = {
  name: "show_message",
  description:
    "Show a text message to the user (e.g. a status update or progress note).",
  parameters: {
    type: "object",
    properties: {
      message: {
        type: "string",
        description: "The message text to show the user",
      },
    },
    required: ["message"],
  },
  run: (args, ctx) => {
    const message = typeof args.message === "string" ? args.message.trim() : "";
    if (!message) return "No message provided.";
    ctx.emit?.("notice", { text: message });
    return `Shown message to the user: ${message}`;
  },
};

export default tool;
