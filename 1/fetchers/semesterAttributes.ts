import { FetchResult } from "./types.ts";

const BASE_URL = "https://swing.langara.bc.ca/prod";

export async function fetchSemesterAttributes(sourceIdentifier: string): Promise<FetchResult> {
    // sourceIdentifier is the term (e.g., "202410")
    const term = sourceIdentifier;
    const url = `${BASE_URL}/hzgkcald.P_DispCrseAttr?term_in=${term}`;
    console.log(`[SemesterAttributes] Fetching: ${url}`);
    
    const response = await fetch(url, { method: "POST" });
    const content = await response.text();
    
    console.log(`[SemesterAttributes] Fetched ${content.length} bytes for term ${term}`);
    
    return {
        content,
        contentType: 'text/html'
    };
}
