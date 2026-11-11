import { migrate, closeDb } from "./db.js";
await migrate();
await closeDb();
console.log("Migrações aplicadas.");
