import { Database } from "bun:sqlite";
import { fetchConfig } from "../config.ts";
import { applySQLitePragmas } from "../../sqlite.ts";

const db = new Database("./data/database.sqlite");
applySQLitePragmas(db);

// Create the Source table
db.run(`
    CREATE TABLE IF NOT EXISTS Source (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sourceType TEXT NOT NULL,
        sourceIdentifier TEXT NOT NULL,
        fetchFrequency INTEGER NOT NULL,
        nextFetch TEXT NOT NULL,
        lastFetched TEXT,
        lastSaved TEXT,
        lastSavedContentHash TEXT,
        savedCount INTEGER DEFAULT 0,
        isActive INTEGER NOT NULL CHECK (isActive IN (0, 1))
    )
`);

// Seed the two meta tasks.
// - DiscoverSemesters:        probes Langara for available terms and registers
//                             SemesterSearch/Catalogue/Attributes sources for each.
// - DiscoverTransferSubjects: queries BC Transfer Guide for subject list and
//                             registers TransferCredits sources for each subject.
const metaTasks: { sourceType: string; sourceIdentifier: string; fetchFrequency: number }[] = [
    { sourceType: "DiscoverSemesters",        sourceIdentifier: "all", fetchFrequency: fetchConfig.frequencies.DiscoverSemesters },
    { sourceType: "DiscoverTransferSubjects", sourceIdentifier: "all", fetchFrequency: fetchConfig.frequencies.DiscoverTransferSubjects },
    { sourceType: "DiscoverLangaraCourses",   sourceIdentifier: "all", fetchFrequency: fetchConfig.frequencies.DiscoverLangaraCourses },
];

for (const task of metaTasks) {
    const existing = db.query(
        `SELECT id FROM Source WHERE sourceType = ? AND sourceIdentifier = ?`
    ).get(task.sourceType, task.sourceIdentifier);

    if (!existing) {
        db.run(
            `INSERT INTO Source (sourceType, sourceIdentifier, fetchFrequency, nextFetch, isActive) VALUES (?, ?, ?, ?, 1)`,
            [task.sourceType, task.sourceIdentifier, task.fetchFrequency, new Date().toISOString()]
        );
        console.log(`[Initialize] Seeded meta task: ${task.sourceType}`);
    }
}

