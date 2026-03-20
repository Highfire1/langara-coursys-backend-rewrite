import { Database } from "bun:sqlite";
import { createPublicApi } from "./3/publicApi.ts";
import { createPrivateApi } from "./3/privateApi.ts";
import { handleFrontend } from "./4/index.ts";
import path from "path";
import { applySQLitePragmas } from "../sqlite.ts";

const db = new Database("./data/database.sqlite");
applySQLitePragmas(db);

// ── Indexes ───────────────────────────────────────────────────────────────────
setTimeout(() => {
    try {
        db.run(`CREATE INDEX IF NOT EXISTS idx_section_course_online ON Section(subject, courseCode, section, year, term)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_section_course_semester ON Section(subject, courseCode, year, term)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_transfer_course ON Transfer(subject, courseNumber)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_section_section ON Section(section)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_schedule_crn_year_term_instructor ON ScheduleEntry(crn, year, term, instructor)`);
        console.log("Indexes ready");
    } catch (e) {
        console.error("Failed to create indexes:", e);
    }
}, 0);

// ── _CourseCache ──────────────────────────────────────────────────────────────
// Pre-materialized table of the full course record per (subject, courseCode).
// Materializes the expensive multi-CTE Course VIEW once at startup so every filter,
// JOIN, and count against course fields hits a real indexed table.

// DDL runs unconditionally — the table must always exist before any request is served.
db.run(`DROP TABLE IF EXISTS _CourseAttrCurrent`); // remove narrow attr-only table from previous deployments
db.run(`
    CREATE TABLE IF NOT EXISTS _CourseCache (
        subject                 TEXT NOT NULL,
        courseCode              TEXT NOT NULL,
        title                   TEXT,
        onLangaraWebsite        INTEGER NOT NULL DEFAULT 0,
        studyType               TEXT,
        credits                 REAL,
        lectureHours            REAL,
        seminarHours            REAL,
        labHours                REAL,
        description             TEXT,
        descPrerequisites       TEXT,
        descCorequisites        TEXT,
        descDegreeRequirements  TEXT,
        descRequisitesCatalogue TEXT,
        descReplacementCourse   TEXT,
        courseOutlineUrl        TEXT,
        attr2AR  INTEGER NOT NULL DEFAULT 0,
        attr2SC  INTEGER NOT NULL DEFAULT 0,
        attrHUM  INTEGER NOT NULL DEFAULT 0,
        attrLSC  INTEGER NOT NULL DEFAULT 0,
        attrSCI  INTEGER NOT NULL DEFAULT 0,
        attrSOC  INTEGER NOT NULL DEFAULT 0,
        attrUT   INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (subject, courseCode)
    )
`);

function rebuildCourseCache() {
    // The INSERT is wrapped separately — the table always exists even if population fails
    // (e.g., source tables empty on a fresh database or during initial fetch).
    try {
        db.run(`
            INSERT OR REPLACE INTO _CourseCache
                (subject, courseCode, title, onLangaraWebsite, studyType, credits,
                 lectureHours, seminarHours, labHours, description,
                 descPrerequisites, descCorequisites, descDegreeRequirements,
                 descRequisitesCatalogue, descReplacementCourse, courseOutlineUrl,
                 attr2AR, attr2SC, attrHUM, attrLSC, attrSCI, attrSOC, attrUT)
            WITH
            all_courses(subject, courseCode) AS (
                SELECT subject, courseCode FROM CourseSummary
                UNION SELECT subject, courseCode FROM Section
                UNION SELECT subject, courseNumber FROM Transfer
                UNION SELECT subject, courseCode FROM LangaraCourseDetail
            ),
            latest_catalogue AS (
                SELECT cs.*
                FROM CourseSummary cs
                INNER JOIN (
                    SELECT subject, courseCode, MAX(year * 100 + term) AS maxYT
                    FROM CourseSummary GROUP BY subject, courseCode
                ) m ON cs.subject = m.subject AND cs.courseCode = m.courseCode
                   AND cs.year * 100 + cs.term = m.maxYT
            ),
            latest_attribute AS (
                SELECT ca.*
                FROM CourseAttribute ca
                INNER JOIN (
                    SELECT subject, courseCode, MAX(year * 100 + term) AS maxYT
                    FROM CourseAttribute GROUP BY subject, courseCode
                ) m ON ca.subject = m.subject AND ca.courseCode = m.courseCode
                   AND ca.year * 100 + ca.term = m.maxYT
            )
            SELECT
                c.subject, c.courseCode,
                COALESCE(lcd.title,        lcat.title),
                CASE WHEN lcd.slug IS NOT NULL THEN 1 ELSE 0 END,
                lcd.studyType,
                COALESCE(lcd.credits,      lcat.credits),
                COALESCE(lcd.lectureHours, lcat.hoursLecture),
                COALESCE(lcd.seminarHours, lcat.hoursSeminar),
                COALESCE(lcd.labHours,     lcat.hoursLab),
                COALESCE(lcd.description,  lcat.description),
                lcd.descPrerequisites,
                lcd.descCorequisites,
                lcd.descDegreeRequirements,
                lcat.descRequisites,
                lcat.descReplacementCourse,
                lcd.courseOutlineUrl,
                COALESCE(la.attr2AR, 0), COALESCE(la.attr2SC, 0), COALESCE(la.attrHUM, 0),
                COALESCE(la.attrLSC, 0), COALESCE(la.attrSCI, 0), COALESCE(la.attrSOC, 0),
                COALESCE(la.attrUT,  0)
            FROM all_courses c
            LEFT JOIN LangaraCourseDetail lcd
                   ON lcd.subject = c.subject AND lcd.courseCode = c.courseCode
            LEFT JOIN latest_catalogue lcat
                   ON lcat.subject = c.subject AND lcat.courseCode = c.courseCode
            LEFT JOIN latest_attribute la
                   ON la.subject = c.subject AND la.courseCode = c.courseCode
        `);
        console.log("_CourseCache rebuilt");
    } catch (e) {
        console.error("Failed to rebuild _CourseCache:", e);
    }
}

rebuildCourseCache();
// Keep the cache fresh as the fetch services write new data.
setInterval(rebuildCourseCache, 5 * 60 * 1000);

const PORT = 3000;

// Initialize Elysia apps for APIs
const publicApi = createPublicApi(db);
const privateApi = createPrivateApi(db);

Bun.serve({
    port: PORT,
    async fetch(req) {
        const url = new URL(req.url);
        const pathname = url.pathname;
        const normalizedPath = pathname !== '/' && pathname.endsWith('/')
            ? pathname.slice(0, -1)
            : pathname;

        const withPath = (newPath: string) => {
            const u = new URL(req.url);
            u.pathname = newPath;
            return new Request(u, req);
        };
        
        if (normalizedPath.startsWith('/api')) {
            // const strippedPath = normalizedPath.slice(4); // Remove '/api'
            const publicResp = await publicApi.handle(withPath(normalizedPath));
            if (publicResp.status !== 404) return publicResp;
        }

        // Private API routes - /privapi/** (normalized)
        if (normalizedPath.startsWith('/privapi/')) {
            const privateResp = await privateApi.handle(withPath(normalizedPath));
            if (privateResp.status !== 404) return privateResp;
        }

        // Frontend routes - everything else
        return await handleFrontend(req, db, privateApi);
    },
});

console.log(`Server running on http://localhost:${PORT}`);
