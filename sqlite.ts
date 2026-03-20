import type { Database } from "bun:sqlite";

export function applySQLitePragmas(db: Database): void {
    db.run("PRAGMA busy_timeout = 5000");
    db.run("PRAGMA journal_mode = WAL");
}
