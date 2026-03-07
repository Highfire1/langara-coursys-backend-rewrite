/**
 * Centralised fetch configuration.
 *
 * Every value can be overridden via environment variable.
 * FETCH_FREQ_*   — refresh interval in hours
 * FETCH_OFFSET_* — spread window in seconds; re-fetches for a source type are
 *                  staggered by (sourceId % offsetSeconds) so they don't all
 *                  land at exactly the same time on subsequent cycles.
 *                  First-run fetches are always immediate (nextFetch = now on INSERT).
 */

function hours(envVar: string, defaultHours: number): number {
    const v = Bun.env[envVar];
    if (!v) return defaultHours;
    const n = parseInt(v, 10);
    return isNaN(n) || n <= 0 ? defaultHours : n;
}

function seconds(envVar: string, defaultSeconds: number): number {
    const v = Bun.env[envVar];
    if (!v) return defaultSeconds;
    const n = parseInt(v, 10);
    return isNaN(n) || n < 0 ? defaultSeconds : n;
}

export const fetchConfig = {
    frequencies: {
        SemesterSearch:           hours('FETCH_FREQ_SEMESTER_SEARCH',             24),
        SemesterCatalogue:        hours('FETCH_FREQ_SEMESTER_CATALOGUE',         168),
        SemesterAttributes:       hours('FETCH_FREQ_SEMESTER_ATTRIBUTES',        168),
        TransferCredits:          hours('FETCH_FREQ_TRANSFER_CREDITS',           168),
        LangaraCoursePage:        hours('FETCH_FREQ_LANGARA_COURSE_PAGE',        168),
        DiscoverSemesters:        hours('FETCH_FREQ_DISCOVER_SEMESTERS',         168),
        DiscoverTransferSubjects: hours('FETCH_FREQ_DISCOVER_TRANSFER_SUBJECTS', 168),
        DiscoverLangaraCourses:   hours('FETCH_FREQ_DISCOVER_LANGARA_COURSES',   168),
    },
    offsets: {
        // Spread re-fetches for high-volume types across a window.
        // sourceId % offsetSeconds is added to nextFetch (in seconds).
        SemesterSearch:           seconds('FETCH_OFFSET_SEMESTER_SEARCH',     7200), // 2-hour window
        SemesterCatalogue:        seconds('FETCH_OFFSET_SEMESTER_CATALOGUE',   7200),
        SemesterAttributes:       seconds('FETCH_OFFSET_SEMESTER_ATTRIBUTES',  7200),
        TransferCredits:          seconds('FETCH_OFFSET_TRANSFER_CREDITS',     3600), // 1-hour window
        LangaraCoursePage:        seconds('FETCH_OFFSET_LANGARA_COURSE_PAGE',  3600),
        // Meta tasks only run one at a time — no stagger needed
        DiscoverSemesters:        0,
        DiscoverTransferSubjects: 0,
        DiscoverLangaraCourses:   0,
    },
} as const;

export type SourceTypeName = keyof typeof fetchConfig.frequencies;
