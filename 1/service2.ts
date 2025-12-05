import { Database } from "bun:sqlite";
import { Source } from "../types.ts";
import { createHash } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import type { FetchResult } from "./fetchers/index.ts";
import {
    fetchSemesterSearch,
    fetchSemesterCatalogue,
    fetchSemesterAttributes,
    fetchTransferCredits
} from "./fetchers/index.ts";

const db = new Database("database.sqlite", { create: true });

// Create SourceFetched table
db.run(`
    CREATE TABLE IF NOT EXISTS SourceFetched (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sourceId INTEGER NOT NULL,
        fetchedAt TEXT NOT NULL,
        contentHash TEXT NOT NULL,
        contentType TEXT NOT NULL,
        contentLink TEXT NOT NULL,
        FOREIGN KEY (sourceId) REFERENCES Source(id)
    )
`);

// Directory to store fetched content
const CONTENT_DIR = "./fetched_content";

// Ensure content directory exists
await mkdir(CONTENT_DIR, { recursive: true });

// Helper to compute content hash
function computeHash(content: string): string {
    return createHash("sha256").update(content).digest("hex");
}

// Helper to save content to file and return the link
async function saveContent(sourceType: string, sourceId: number, content: string, extension: string): Promise<string> {
    const timestamp = Date.now();
    const filename = `${sourceType}_${sourceId}_${timestamp}.${extension}`;
    const filepath = join(CONTENT_DIR, filename);
    await writeFile(filepath, content);
    return `file://${filepath}`;
}

// Main fetcher that routes to the appropriate template
async function fetchSource(source: Source): Promise<FetchResult> {
    switch (source.sourceType) {
        case 'SemesterSearch':
            return fetchSemesterSearch(source.sourceIdentifier);
        case 'SemesterCatalogue':
            return fetchSemesterCatalogue(source.sourceIdentifier);
        case 'SemesterAttributes':
            return fetchSemesterAttributes(source.sourceIdentifier);
        case 'TransferCredits':
            return fetchTransferCredits(source.sourceIdentifier);
        default:
            throw new Error(`Unknown source type: ${source.sourceType}`);
    }
}

// Process a single source: fetch, save, and record in SourceFetched
async function processSource(source: Source): Promise<void> {
    console.log(`Processing source: ${source.sourceType} (${source.sourceIdentifier})`);
    
    try {
        const fetchedAt = new Date();
        const { content, contentType } = await fetchSource(source);
        const contentHash = computeHash(content);
        
        // Check if content has changed since last fetch
        if (source.lastSavedContentHash === contentHash) {
            console.log(`  Content unchanged, skipping save`);
            // Update lastFetched but don't save new content
            db.run(
                `UPDATE Source SET lastFetched = ?, nextFetch = ? WHERE id = ?`,
                [
                    fetchedAt.toISOString(),
                    new Date(fetchedAt.getTime() + source.fetchFrequency * 3600000).toISOString(),
                    source.id
                ]
            );
            return;
        }
        
        // Save content to file
        const extension = contentType === 'application/json' ? 'json' : 'html';
        const contentLink = await saveContent(source.sourceType, source.id, content, extension);
        
        // Insert into SourceFetched
        db.run(
            `INSERT INTO SourceFetched (sourceId, fetchedAt, contentHash, contentType, contentLink) VALUES (?, ?, ?, ?, ?)`,
            [
                source.id,
                fetchedAt.toISOString(),
                contentHash,
                contentType,
                contentLink
            ]
        );
        
        // Update Source record
        db.run(
            `UPDATE Source SET 
                lastFetched = ?, 
                lastSaved = ?, 
                lastSavedContentHash = ?, 
                savedCount = savedCount + 1,
                nextFetch = ?
            WHERE id = ?`,
            [
                fetchedAt.toISOString(),
                fetchedAt.toISOString(),
                contentHash,
                new Date(fetchedAt.getTime() + source.fetchFrequency * 3600000).toISOString(),
                source.id
            ]
        );
        
        console.log(`  Saved: ${contentLink}`);
    } catch (error) {
        console.error(`  Error processing source ${source.id}:`, error);
    }
}

// Get sources that need to be fetched (nextFetch <= now and isActive)
function getSourcesDueForFetch(): Source[] {
    const now = new Date().toISOString();
    const rows = db.query(
        `SELECT * FROM Source WHERE nextFetch <= ? AND isActive = 1 ORDER BY nextFetch ASC`
    ).all(now) as any[];
    
    return rows.map(row => ({
        id: row.id,
        sourceType: row.sourceType,
        sourceIdentifier: row.sourceIdentifier,
        fetchFrequency: row.fetchFrequency,
        nextFetch: new Date(row.nextFetch),
        lastFetched: row.lastFetched ? new Date(row.lastFetched) : null,
        lastSaved: row.lastSaved ? new Date(row.lastSaved) : null,
        lastSavedContentHash: row.lastSavedContentHash,
        savedCount: row.savedCount,
        isActive: row.isActive === 1
    }));
}

// Main loop to process sources
async function main() {
    console.log("Service 2: Fetcher starting...");
    
    while (true) {
        const sourcesToFetch = getSourcesDueForFetch();
        
        if (sourcesToFetch.length > 0) {
            console.log(`Found ${sourcesToFetch.length} sources due for fetch`);
            
            for (const source of sourcesToFetch) {
                await processSource(source);
                // Add a small delay between fetches to be polite
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        } else {
            console.log("No sources due for fetch");
        }
        
        // Wait before checking again (e.g., 1 minute)
        await new Promise(resolve => setTimeout(resolve, 60000));
    }
}

// Run the main loop
main().catch(console.error);
