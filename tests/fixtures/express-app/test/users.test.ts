import { listUsers } from "../src/services/users.ts";

if (listUsers().length === 0) {
  throw new Error("expected users");
}
