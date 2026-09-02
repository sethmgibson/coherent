export function usedHelper(): string {
  return "ok";
}

function neverUsedInternal(): number {
  return 1;
}

export function callUsed(): string {
  return usedHelper();
}
