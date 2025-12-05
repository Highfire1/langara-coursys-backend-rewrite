import { FetchResult } from "./types.ts";

const BASE_URL = "https://swing.langara.bc.ca/prod";

export async function fetchSemesterCatalogue(sourceIdentifier: string): Promise<FetchResult> {
    // sourceIdentifier is the term (e.g., "202410")
    const term = sourceIdentifier;
    const url = `${BASE_URL}/hzgkcald.P_DisplayCatalog?term_in=${term}`;
    // console.log(`[SemesterCatalogue] Fetching: ${url}`);
    
    const response = await fetch(url, { method: "POST" });
    const content = await response.text();
    
    // console.log(`[SemesterCatalogue] Fetched ${content.length} bytes for term ${term}`);
    
    return {
        content,
        contentType: 'text/html'
    };
}
