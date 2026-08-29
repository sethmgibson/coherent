declare function require(name: string): { Pool: new () => { ok: boolean }; Client: new () => { ok: boolean } };

const { Pool } = require("pg");

export function makePool(): { ok: boolean } {
  return new Pool();
}

const lib = { Client: class Client { ok = true; } };
const { Client } = lib;
export const client = new Client();
