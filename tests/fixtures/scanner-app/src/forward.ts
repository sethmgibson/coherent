export function persistCharge(amount: number): Promise<number> {
  return writeCharge(amount);
}

export function writeCharge(amount: number): Promise<number> {
  return Promise.resolve(amount);
}

export function authorizeAndCharge(userId: string, amount: number): Promise<number> {
  if (!userId) throw new Error("unauthorized");
  return writeCharge(amount);
}

export function validateThenWrite(amount: number): Promise<number> {
  if (amount < 0) throw new Error("invalid");
  return writeCharge(amount);
}
