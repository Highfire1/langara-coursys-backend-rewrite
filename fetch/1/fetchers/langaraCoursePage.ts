import type { FetchResult } from "./types.ts";

const BASE_URL = "https://langara.ca";

// sourceIdentifier is the URL slug, e.g. "cpsc-1150"
export async function fetchLangaraCoursePage(sourceIdentifier: string): Promise<FetchResult> {
    const url = `${BASE_URL}/programs-courses/${sourceIdentifier}`;

    const response = await fetch(url, {
        headers: {
            "Accept": "text/html",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0",
        },
    });

    if (!response.ok) {
        throw new Error(`[LangaraCoursePage] HTTP ${response.status} for ${url}`);
    }

    const content = await response.text();
    return { content, contentType: "text/html" };
}
