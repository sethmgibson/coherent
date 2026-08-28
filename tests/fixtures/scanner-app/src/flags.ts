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
