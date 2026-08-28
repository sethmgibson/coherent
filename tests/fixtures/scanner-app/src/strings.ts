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
