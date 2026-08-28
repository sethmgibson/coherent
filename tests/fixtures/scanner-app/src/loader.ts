export async function loadPlugin(): Promise<unknown> {
  return import("./plugin.ts");
}
