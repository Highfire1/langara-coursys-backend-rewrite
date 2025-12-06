import { Database } from "bun:sqlite";
import { Source } from "../../types.ts";

const db = new Database("./data/database.sqlite");


interface SourceInfo {
    sourceCode: 'SemesterSearch' | 'SemesterCatalogue' | 'SemesterAttributes' | 'TransferCredits' | 'TransferCreditSubjects';
    sourceIdentifier: string;
    fetchFrequency: number; // in hours
}

const sources: SourceInfo[] = []

let terms = [];

terms.push('199920'); terms.push('199930');

for (let year = 2000; year <= 2025; year++) {
    for (const term of ['10', '20', '30']) {
        terms.push(`${year}${term}`);
    }
}

terms.push('202610');
// terms.push('202620');
// terms.push('202630');

// TransferCreditSubjects fetches the subject list and creates TransferCredits entries for each subject
sources.push({
    sourceCode: 'TransferCreditSubjects',
    sourceIdentifier: `all`,
    fetchFrequency: 24*7 // weekly
});

// Note: TransferCredits entries are dynamically created by TransferCreditSubjects fetcher

for (const yt of terms) {
    sources.push({
        sourceCode: 'SemesterSearch',
        sourceIdentifier: `${yt}`,
        fetchFrequency: 24,
    });
}

for (const yt of terms) {
    sources.push({
        sourceCode: 'SemesterCatalogue',
        sourceIdentifier: `${yt}`,
        fetchFrequency: 24*7
    });
}

for (const yt of terms) {
    sources.push({
        sourceCode: 'SemesterAttributes',
        sourceIdentifier: `${yt}`,
        fetchFrequency: 24*7
    });
}


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

for (const source of sources) {
    const existingSource = db.query(
        `SELECT * FROM Source WHERE sourceType = ? AND sourceIdentifier = ?`
    ).get(source.sourceCode, source.sourceIdentifier);

    if (!existingSource) {
        db.run(
            `INSERT INTO Source (sourceType, sourceIdentifier, fetchFrequency, nextFetch, isActive) VALUES (?, ?, ?, ?, ?)`,
            [
                source.sourceCode,
                source.sourceIdentifier,
                source.fetchFrequency,
                new Date().toISOString(), // Fetch immediately on first run
                1
            ]
        );
    }
}

