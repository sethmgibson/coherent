export function matchItems(items: string[], haystack: string[]): string[] {
  const found: string[] = [];
  for (const item of items) {
    if (haystack.find((entry) => entry === item)) found.push(item);
  }
  return found;
}

export function filterInside(items: string[], allow: string[]): string[] {
  const out: string[] = [];
  for (const item of items) {
    out.push(...allow.filter((entry) => entry === item));
  }
  return out;
}

export function nestedWalk(left: string[], right: string[]): number {
  let count = 0;
  for (const a of left) {
    for (const b of right) {
      if (a === b) count += 1;
    }
  }
  return count;
}

export function sortInside(groups: string[][]): string[][] {
  const out: string[][] = [];
  for (const group of groups) {
    out.push(group.slice().sort());
  }
  return out;
}

export function linearScan(items: string[]): string[] {
  return items.filter((item) => item.startsWith("a"));
}
