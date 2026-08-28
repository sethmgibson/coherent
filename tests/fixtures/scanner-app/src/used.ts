export function usedHelper(): number {
  return 1;
}

export function usedByTestsOnly(): string {
  return "kept-alive-by-test-import-in-this-file";
}

void usedByTestsOnly;
