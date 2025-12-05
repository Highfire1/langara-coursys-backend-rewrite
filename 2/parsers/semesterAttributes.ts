import { Database } from "bun:sqlite";

// Parse SemesterAttributes HTML content
// Contains course attribute information for a specific term
export async function parseSemesterAttributes(content: string, sourceIdentifier: string, db: Database): Promise<void> {
    // sourceIdentifier is the term code (e.g., "202510")
    const term = sourceIdentifier;
    
    // TODO: Parse the HTML content and extract attribute data
    // The HTML contains course attributes like "UT" (university transferable), etc.
    
    console.log(`  [SemesterAttributes] Parsing term ${term} - TODO: implement`);
}
