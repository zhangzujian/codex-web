export function exposedMainWorldValue(key: string, api: unknown): unknown {
  if (key === "electronBridge" && typeof api === "object" && api !== null) {
    const sanitized = { ...(api as Record<string, unknown>) };
    delete sanitized.showApplicationMenu;
    return sanitized;
  }
  return api;
}
