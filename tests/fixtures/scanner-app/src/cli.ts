function command(name: string) {
  return {
    action(fn: () => void) {
      void name;
      fn();
      return this;
    },
  };
}

const program = { command };

function syncUsers(): void {
  console.log("sync");
}

program.command("sync").action(syncUsers);

export function unusedCliExport(): void {
  console.log("registered only if someone wires it");
}

function unusedCliLocal(): void {
  console.log("local dead");
}
