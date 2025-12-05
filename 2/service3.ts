// - Service 3 parses each document in the queue and writes that data to the database

import { Database } from "bun:sqlite";
import { Source, SourceFetched } from "../types.ts";
import { readFile } from "fs/promises";
import {
    parseSemesterSearch,
    parseSemesterCatalogue,
    parseSemesterAttributes,
    parseTransferCredits,
    parseTransferCreditSubjects
} from "./parsers/index.ts";

const db = new Database("database.sqlite", { create: true });

// Get content from a contentLink (supports file:// links)
async function getContent(contentLink: string): Promise<string> {
    if (contentLink.startsWith("file://")) {
        const filepath = contentLink.slice(7); // Remove "file://" prefix
        return await readFile(filepath, "utf-8");
    }
    throw new Error(`Unsupported content link format: ${contentLink}`);
}

// Main parser that routes to the appropriate parser
async function parseContent(sourceType: Source['sourceType'], content: string, sourceIdentifier: string): Promise<void> {
    switch (sourceType) {
        case 'SemesterSearch':
            await parseSemesterSearch(content, sourceIdentifier, db);
            break;
        case 'SemesterCatalogue':
            await parseSemesterCatalogue(content, sourceIdentifier, db);
            break;
        case 'SemesterAttributes':
            await parseSemesterAttributes(content, sourceIdentifier, db);
            break;
        case 'TransferCredits':
            await parseTransferCredits(content, sourceIdentifier, db);
            break;
        case 'TransferCreditSubjects':
            await parseTransferCreditSubjects(content, sourceIdentifier, db);
            break;
        default:
            throw new Error(`Unknown source type: ${sourceType}`);
    }
}

// Process a single SourceFetched record
async function processSourceFetched(record: SourceFetched & { sourceType: Source['sourceType']; sourceIdentifier: string }): Promise<void> {
    console.log(`Parsing: ${record.sourceType} (${record.sourceIdentifier}) - ${record.contentLink}`);
    
    try {
        // Get the content
        const content = await getContent(record.contentLink);
        
        // Parse the content and write to database
        await parseContent(record.sourceType, content, record.sourceIdentifier);
        
        // Mark as parsed
        db.run(`UPDATE SourceFetched SET parsed = 1 WHERE id = ?`, [record.id]);
        
        console.log(`  Parsed successfully`);
    } catch (error) {
        console.error(`  Error parsing record ${record.id}:`, error);
    }
}

// Get unparsed SourceFetched records
function getUnparsedRecords(): (SourceFetched & { sourceType: Source['sourceType']; sourceIdentifier: string })[] {
    const rows = db.query(`
        SELECT sf.*, s.sourceType, s.sourceIdentifier 
        FROM SourceFetched sf
        JOIN Source s ON sf.sourceId = s.id
        WHERE sf.parsed = 0
        ORDER BY sf.fetchedAt ASC
    `).all() as any[];
    
    return rows.map(row => ({
        id: row.id,
        sourceId: row.sourceId,
        fetchedAt: new Date(row.fetchedAt),
        contentHash: row.contentHash,
        contentType: row.contentType,
        contentLink: row.contentLink,
        parsed: row.parsed === 1,
        sourceType: row.sourceType,
        sourceIdentifier: row.sourceIdentifier
    }));
}

// Main loop to process unparsed records
async function main() {
    console.log("Service 3: Parser starting...");
    
    while (true) {
        const unparsedRecords = getUnparsedRecords();
        
        if (unparsedRecords.length > 0) {
            console.log(`Found ${unparsedRecords.length} unparsed records`);
            
            for (const record of unparsedRecords) {
                await processSourceFetched(record);
            }
        } else {
            console.log("No unparsed records. Checking again in 30 seconds.");
        }
        
        // Wait before checking again
        await new Promise(resolve => setTimeout(resolve, 30000));
    }
}

// Run the main loop
main().catch(console.error);
