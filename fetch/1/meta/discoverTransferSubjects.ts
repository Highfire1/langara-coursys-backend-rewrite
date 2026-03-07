import { Database } from "bun:sqlite";
import type { FetchResult } from "../fetchers/types.ts";
import { fetchConfig } from "../../config.ts";

const WS_BASE_URL = "https://api.bctransferguide.ca";

const headers = {
    "Accept": "application/json",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0",
};

export async function runDiscoverTransferSubjects(db: Database): Promise<FetchResult> {
    const institutionId = 15; // LANG
    const url = `${WS_BASE_URL}/tcs/custom/ui/v1.8/agreementws/GetSubjects?institutionID=${institutionId}&sending=true`;

    console.log(`[DiscoverTransferSubjects] Fetching subject list for institution ${institutionId}...`);

    const response = await fetch(url, { headers });
    if (!response.ok) {
        throw new Error(`[DiscoverTransferSubjects] Failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as Array<{ id: number; code: string; title: string }>;

    if (!Array.isArray(data)) {
        throw new Error(`[DiscoverTransferSubjects] Unexpected response shape`);
    }

    let newSources = 0;
    for (const subject of data) {
        // sourceIdentifier format: "subjectId:subjectCode:subjectTitle"
        const identifier = `${subject.id}:${subject.code}:${subject.title}`;
        const existing = db.query(
            `SELECT id FROM Source WHERE sourceType = 'TransferCredits' AND sourceIdentifier = ?`
        ).get(identifier);
        if (!existing) {
            db.run(
                `INSERT INTO Source (sourceType, sourceIdentifier, fetchFrequency, nextFetch, isActive) VALUES ('TransferCredits', ?, ?, ?, 1)`,
                [identifier, fetchConfig.frequencies.TransferCredits, new Date().toISOString()]
            );
            newSources++;
            console.log(`[DiscoverTransferSubjects] New source: ${subject.code}`);
        }
    }

    console.log(`[DiscoverTransferSubjects] ${data.length} subjects checked, ${newSources} new sources created`);

    return {
        content: JSON.stringify({
            timestamp: new Date().toISOString(),
            institutionId,
            totalSubjects: data.length,
            newSourcesCreated: newSources,
        }, null, 2),
        contentType: "application/json",
    };
}
