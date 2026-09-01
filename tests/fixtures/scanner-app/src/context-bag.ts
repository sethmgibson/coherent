export interface RequestContext {
  userId: string;
  accountId: string;
  orgId: string;
  requestId: string;
  locale: string;
  timezone: string;
  featureFlags: Record<string, boolean>;
  extras: Record<string, string>;
}

export function handleRequest(ctx: RequestContext): string {
  return ctx.userId;
}

export function stampRequest(ctx: RequestContext): void {
  ctx.requestId = `${ctx.requestId}-x`;
}

export function localeIsOk(ctx: RequestContext): boolean {
  return ctx.locale === "ok";
}

export interface UnusedOptions {
  alpha: string;
  beta: string;
  gamma: string;
  delta: string;
  epsilon: string;
  zeta: string;
  eta: string;
  theta: string;
}
