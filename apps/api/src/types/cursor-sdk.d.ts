/** Optional assistant client. A commercial build does not install this package. */
declare module '@cursor/sdk' {
  export class CursorAgentError extends Error {
    isRetryable?: boolean;
  }
  export class Agent {
    static prompt(
      prompt: string,
      options: {
        apiKey: string;
        model: { id: string };
        local: { cwd: string };
      },
    ): Promise<{ status?: string; result?: string }>;
  }
}
