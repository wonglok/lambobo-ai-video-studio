export interface ToolRunContext {
  projectId: string;
  /** Optional SSE emit function so tools can stream events to the client. */
  emit?: (event: string, data: Record<string, unknown>) => void;
}

export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  run: (
    args: Record<string, unknown>,
    ctx: ToolRunContext,
  ) => string | Promise<string>;
}
