export async function render(
  state: "ready" | "blocked",
): Promise<string> {
  const value: unknown = JSON.parse('"Ready"');
  if (typeof value !== "string") throw new Error("Expected a string");
  await Promise.resolve();
  switch (state) {
    case "ready":
      return value;
    case "blocked":
      return "Blocked";
  }
}
