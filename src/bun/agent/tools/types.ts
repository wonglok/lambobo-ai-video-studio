export interface ToolRunContext {
  projectId: string;
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
