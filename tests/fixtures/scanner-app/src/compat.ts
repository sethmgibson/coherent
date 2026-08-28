/** @deprecated temporary migration — remove once v2 is the only caller */
export function legacyLoadPayment(id: string): string {
  return `legacy:${id}`;
}

export function loadPayment(id: string, useLegacy: boolean): string {
  if (useLegacy) {
    return legacyLoadPayment(id);
  }
  return `v2:${id}`;
}

export function compatFallbackAmount(oldAmount: number | undefined): number {
  return oldAmount ?? 0;
}
