import Database from "bun:sqlite";
import { mkdirSync } from "fs";
import { applySQLitePragmas } from "../sqlite.ts";

mkdirSync("./data", { recursive: true });
const db = new Database("./data/database.sqlite", { create: true });
applySQLitePragmas(db);


console.log("Step 1: Initializing database and sources...");
await import("./1/initialize.ts");

console.log("\nStep 2: Starting fetch loop...");
await import("./1/fetch.ts");

console.log("\nStep 3: Starting parser service...");
await import("./2/service3.ts");

export {};
