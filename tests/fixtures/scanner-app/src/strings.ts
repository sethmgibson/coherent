export function labelStatus(status: string): string {
  if (status === "pending") return "wait";
  if (status === "paid") return "done";
  return "other";
}

export function routeByStatus(status: string): string {
  switch (status) {
    case "pending":
      return "queue";
    case "paid":
      return "complete";
    default:
      return "unknown";
  }
}

export function acceptMode(mode: string): boolean {
  return mode === "Pending" || mode === "PENDING";
}

export function logGreeting(): void {
  console.log("hello from the payment service");
}

export function labelRefund(kind: string): string {
  return kind === "Refund" ? "credit" : "other";
}

export function routeRefund(kind: string): string {
  return kind === "Refund" ? "ledger" : "skip";
}

export function labelrefund(kind: string): string {
  return kind === "refund" ? "credit" : "other";
}

export function routerefund(kind: string): string {
  return kind === "refund" ? "ledger" : "skip";
}

type ChargeState = "open" | "closed";

export function routeTypedCharge(state: ChargeState): string {
  switch (state) {
    case "open":
      return "desk";
    case "closed":
      return "archive";
    default:
      return "unknown";
  }
}

export function otherTypedCharge(state: ChargeState): string {
  switch (state) {
    case "open":
      return "front";
    case "closed":
      return "back";
    default:
      return "unknown";
  }
}
