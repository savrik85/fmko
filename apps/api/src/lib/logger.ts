/**
 * Strukturované logování — JSON logy s kontextem.
 * Jednoduchý, bez závislostí, pro Cloudflare Workers.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  module: string;
  teamId?: string;
  matchId?: string;
  playerId?: string;
  reqId?: string;
  [key: string]: unknown;
}

function log(level: LogLevel, ctx: LogContext, message: string, error?: unknown): void {
  const entry: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    mod: ctx.module,
    msg: message,
  };

  // Add optional context fields
  if (ctx.teamId) entry.teamId = ctx.teamId;
  if (ctx.matchId) entry.matchId = ctx.matchId;
  if (ctx.playerId) entry.playerId = ctx.playerId;
  if (ctx.reqId) entry.reqId = ctx.reqId;

  // Add error details
  if (error instanceof Error) {
    entry.err = error.message;
    entry.stack = error.stack?.split("\n").slice(0, 4).join(" | ");
  } else if (error !== undefined) {
    entry.err = String(error);
  }

  const json = JSON.stringify(entry);
  if (level === "error") console.error(json);
  else if (level === "warn") console.warn(json);
  else console.log(json);
}

export const logger = {
  debug: (ctx: LogContext, msg: string) => log("debug", ctx, msg),
  info: (ctx: LogContext, msg: string) => log("info", ctx, msg),
  warn: (ctx: LogContext, msg: string, err?: unknown) => log("warn", ctx, msg, err),
  error: (ctx: LogContext, msg: string, err?: unknown) => log("error", ctx, msg, err),
};
