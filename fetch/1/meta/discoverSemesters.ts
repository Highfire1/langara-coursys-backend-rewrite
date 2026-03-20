import { Database } from "bun:sqlite";
import type { FetchResult } from "../fetchers/types.ts";
import { fetchConfig } from "../../config.ts";

const BASE_URL = "https://swing.langara.bc.ca/prod";

function nextTerm(yearTerm: string): string {
    const year = parseInt(yearTerm.slice(0, 4));
    const term = parseInt(yearTerm.slice(4));
    if (term === 10) return `${year}20`;
    if (term === 20) return `${year}30`;
    return `${year + 1}10`;
}

// Probe Langara to check whether a term has any subjects in the course search dropdown.
// For nonexistent/future terms the page still loads but the subj_id select has 0 options.
async function termHasSubjects(term: string): Promise<boolean> {
    try {
        const url = `${BASE_URL}/hzgkfcls.P_Sel_Crse_Search?term=${term}`;
        const response = await fetch(url, { method: "POST" });
        const html = await response.text();
        // Extract only the contents of the subj_id select element
        const selectMatch = html.match(/<select[^>]*id="subj_id"[^>]*>([\s\S]*?)<\/select>/i);
        if (!selectMatch) return false;
        // Count real subject options (non-empty values)
        const optionMatches = selectMatch[1].match(/<option\s+value="([^"]+)"/gi);
        return optionMatches !== null && optionMatches.length > 0;
    } catch {
        return false;
    }
}

// Generate all terms that almost certainly exist (everything up to last year)
function historicalTerms(): string[] {
    const terms: string[] = [];
    terms.push("199920", "199930");
    const lastYear = new Date().getFullYear() - 1;
    for (let year = 2000; year <= lastYear; year++) {
        for (const t of ["10", "20", "30"]) {
            terms.push(`${year}${t}`);
        }
    }
    return terms;
}

function ensureSource(db: Database, sourceType: string, identifier: string, fetchFrequency: number) {
    const existing = db.query(
        `SELECT id FROM Source WHERE sourceType = ? AND sourceIdentifier = ?`
    ).get(sourceType, identifier);
    if (!existing) {
        db.run(
            `INSERT INTO Source (sourceType, sourceIdentifier, fetchFrequency, nextFetch, isActive) VALUES (?, ?, ?, ?, 1)`,
            [sourceType, identifier, fetchFrequency, new Date().toISOString()]
        );
        return true;
    }
    db.run(
        `UPDATE Source SET fetchFrequency = ? WHERE sourceType = ? AND sourceIdentifier = ?`,
        [fetchFrequency, sourceType, identifier]
    );
    return false;
}

function registerTerm(db: Database, term: string): boolean {
    // Returns true if anything was newly inserted
    const a = ensureSource(db, "SemesterSearch",    term, fetchConfig.frequencies.SemesterSearch);
    const b = ensureSource(db, "SemesterCatalogue", term, fetchConfig.frequencies.SemesterCatalogue);
    const c = ensureSource(db, "SemesterAttributes", term, fetchConfig.frequencies.SemesterAttributes);
    return a || b || c;
}

export async function runDiscoverSemesters(db: Database): Promise<FetchResult> {
    const historicalInserted: string[] = [];
    const probeDiscovered: string[] = [];
    const probeChecked: string[] = [];

    // 1. Bulk-insert all historical terms without probing (they're known to exist)
    for (const term of historicalTerms()) {
        if (registerTerm(db, term)) {
            historicalInserted.push(term);
        }
    }

    // 2. Find the current max registered term, then probe forward
    const row = db.query(
        `SELECT MAX(sourceIdentifier) as maxTerm FROM Source WHERE sourceType = 'SemesterSearch'`
    ).get() as { maxTerm: string | null };

    let candidate = nextTerm(row.maxTerm ?? `${new Date().getFullYear() - 1}30`);

    let consecutiveMisses = 0;
    while (consecutiveMisses < 3) {
        probeChecked.push(candidate);
        console.log(`[DiscoverSemesters] Probing term ${candidate}...`);
        const exists = await termHasSubjects(candidate);
        if (exists) {
            registerTerm(db, candidate);
            probeDiscovered.push(candidate);
            consecutiveMisses = 0;
            candidate = nextTerm(candidate);
        } else {
            consecutiveMisses++;
            candidate = nextTerm(candidate);
        }
    }

    console.log(`[DiscoverSemesters] Historical inserted: ${historicalInserted.length}, Probe discovered: ${probeDiscovered.join(", ") || "none"}`);

    return {
        content: JSON.stringify({
            timestamp: new Date().toISOString(),
            historicalInserted: historicalInserted.length,
            probeChecked,
            probeDiscovered,
        }, null, 2),
        contentType: "application/json",
    };
}
