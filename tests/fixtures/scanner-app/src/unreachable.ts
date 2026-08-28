export function afterReturn(flag: boolean): number {
  if (flag) {
    return 1;
    return 2;
  }
  return 0;
}
