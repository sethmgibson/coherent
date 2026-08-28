function neverUsedInternal(): string {
  return "dead";
}

const unusedConstant = 42;

export function reachableAfterCleanup(): string {
  return "still used after other files drop references";
}

void reachableAfterCleanup;
