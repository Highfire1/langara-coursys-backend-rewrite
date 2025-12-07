import { Database } from "bun:sqlite";

const db = new Database("./data/database.sqlite");
const tables = db.query("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>;
console.log("Tables:", tables.map(t => t.name).join(", "));

// Get schema for each table
for (const table of tables) {
    const columns = db.query(`PRAGMA table_info(${table.name})`).all() as Array<{ name: string; type: string }>;
    console.log(`\n${table.name}:`);
    columns.forEach(col => console.log(`  ${col.name}: ${col.type}`));
}
