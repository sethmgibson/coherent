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

const CHARGE_IDS = ["charge-1", "charge-2"] as const;
export type ChargeId = (typeof CHARGE_IDS)[number];

export function isChargeId(value: string): value is ChargeId {
  return (CHARGE_IDS as readonly string[]).includes(value);
}

function query() {
  return {
    from(_table: string) {
      return {
        limit(count: number) {
          return count;
        },
      };
    },
  };
}

export function pageCharges(limit: number): number {
  return query().from("charges").limit(limit);
}
