import { Database } from "bun:sqlite";
import type { FetchResult } from "../fetchers/types.ts";
import { fetchConfig } from "../../config.ts";

const BASE_URL = "https://langara.ca";
const SUBJECTS_URL = `${BASE_URL}/programs-courses/search-courses/regular-studies-courses-subject-area`;

// Extract all category hrefs from the subjects listing page.
// Links look like: href="/programs-courses/search-all-courses/regular-studies-courses-subject-area/computer-science"
function extractCategoryUrls(html: string): string[] {
    const seen = new Set<string>();
    const regex = /href="(\/programs-courses\/search-all-courses\/regular-studies-courses-subject-area\/[^"]+)"/g;
    let match;
    while ((match = regex.exec(html)) !== null) {
        seen.add(BASE_URL + match[1]);
    }
    return [...seen];
}

// Extract all course slugs from a category page.
// Links look like: href="/programs-courses/cpsc-1150"
function extractCourseSlugs(html: string): string[] {
    const seen = new Set<string>();
    // Match /programs-courses/SUBJ-NNNN (subject = letters, code = digits, optional suffix)
    const regex = /href="\/programs-courses\/([a-z]+-\d+[^"#?]*)"/gi;
    let match;
    while ((match = regex.exec(html)) !== null) {
        seen.add(match[1].toLowerCase());
    }
    return [...seen];
}

async function fetchHtml(url: string): Promise<string> {
    const response = await fetch(url, {
        headers: {
            "Accept": "text/html",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0",
        },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    return response.text();
}

function ensureCourseSource(db: Database, slug: string): boolean {
    const existing = db.query(
        `SELECT id FROM Source WHERE sourceType = 'LangaraCoursePage' AND sourceIdentifier = ?`
    ).get(slug);
    if (!existing) {
        db.run(
            `INSERT INTO Source (sourceType, sourceIdentifier, fetchFrequency, nextFetch, isActive) VALUES ('LangaraCoursePage', ?, ?, ?, 1)`,
            [slug, fetchConfig.frequencies.LangaraCoursePage, new Date().toISOString()]
        );
        return true;
    }
    db.run(
        `UPDATE Source SET fetchFrequency = ? WHERE sourceType = 'LangaraCoursePage' AND sourceIdentifier = ?`,
        [fetchConfig.frequencies.LangaraCoursePage, slug]
    );
    return false;
}

export async function runDiscoverLangaraCourses(db: Database): Promise<FetchResult> {
    console.log(`[DiscoverLangaraCourses] Fetching subject areas from ${SUBJECTS_URL}`);

    const subjectsHtml = await fetchHtml(SUBJECTS_URL);
    const categoryUrls = extractCategoryUrls(subjectsHtml);

    console.log(`[DiscoverLangaraCourses] Found ${categoryUrls.length} subject area categories`);

    const allSlugs = new Set<string>();
    let newSources = 0;

    for (const categoryUrl of categoryUrls) {
        try {
            const categoryHtml = await fetchHtml(categoryUrl);
            const slugs = extractCourseSlugs(categoryHtml);
            for (const slug of slugs) allSlugs.add(slug);
        } catch (err) {
            console.warn(`[DiscoverLangaraCourses] Failed to fetch ${categoryUrl}: ${err}`);
        }
    }

    for (const slug of allSlugs) {
        if (ensureCourseSource(db, slug)) {
            newSources++;
        }
    }

    console.log(`[DiscoverLangaraCourses] ${allSlugs.size} courses found, ${newSources} new sources registered`);

    return {
        content: JSON.stringify({
            timestamp: new Date().toISOString(),
            categoriesChecked: categoryUrls.length,
            totalCourses: allSlugs.size,
            newSourcesCreated: newSources,
        }, null, 2),
        contentType: "application/json",
    };
}
