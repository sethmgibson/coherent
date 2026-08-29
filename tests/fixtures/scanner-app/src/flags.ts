export function createOrder(
  isGift: boolean,
  rush: boolean,
  notify: boolean,
  dryRun: boolean,
): string {
  if (dryRun) return "preview";
  if (isGift && rush) return "gift-rush";
  if (notify) return "notify";
  return "ok";
}

export function toggleFeature(enabled: boolean, verbose: boolean): string {
  if (enabled) return verbose ? "on-loud" : "on";
  return "off";
}

export function pricedByLength(items: { length: number }, amount: number): number {
  if (items.length) return 1;
  if (amount) return 2;
  if (undefined) return 3;
  return 0;
}

export function sizedByLength(items: { length: number }, amount: number): number {
  if (items.length) return 1;
  if (amount) return 2;
  if (undefined) return 3;
  return 0;
}
