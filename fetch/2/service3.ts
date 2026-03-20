// - Service 3 parses each document in the queue and writes that data to the database

import { Database } from "bun:sqlite";
import { Source, SourceFetched } from "../../types.ts";
import { readFile } from "fs/promises";
import {
    parseSemesterSearch,
    parseSemesterCatalogue,
    parseSemesterAttributes,
    parseTransferCredits,
    parseLangaraCoursePage,
} from "./parsers/index.ts";

const db = new Database("./data/database.sqlite");
db.run("PRAGMA busy_timeout = 5000");
db.run("PRAGMA journal_mode = WAL");

function isSqliteBusyError(error: unknown): boolean {
    const e = error as { code?: string; message?: string };
    return e?.code === "SQLITE_BUSY" || e?.message?.includes("database is locked") === true;
}

// Create Transfer table for parsed transfer credit data
db.run(`
    CREATE TABLE IF NOT EXISTS Transfer (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sourceId INTEGER NOT NULL,
        subject TEXT NOT NULL,
        courseNumber TEXT NOT NULL,
        source TEXT NOT NULL,
        sourceCredits REAL,
        sourceTitle TEXT,
        destination TEXT NOT NULL,
        destinationName TEXT NOT NULL,
        credit TEXT NOT NULL,
        condition TEXT,
        effectiveStart TEXT NOT NULL,
        effectiveEnd TEXT,
        FOREIGN KEY (sourceId) REFERENCES SourceFetched(id)
    )
`);

// Create indexes for common queries
db.run(`CREATE INDEX IF NOT EXISTS idx_transfer_subject ON Transfer(subject)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_transfer_destination ON Transfer(destination)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_transfer_effective_end ON Transfer(effectiveEnd)`);

// Create CourseAttribute table for parsed course attribute data
db.run(`
    CREATE TABLE IF NOT EXISTS CourseAttribute (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sourceId INTEGER NOT NULL,
        subject TEXT NOT NULL,
        courseCode TEXT NOT NULL,
        year INTEGER NOT NULL,
        term INTEGER NOT NULL,
        attr2AR INTEGER NOT NULL DEFAULT 0,
        attr2SC INTEGER NOT NULL DEFAULT 0,
        attrHUM INTEGER NOT NULL DEFAULT 0,
        attrLSC INTEGER NOT NULL DEFAULT 0,
        attrSCI INTEGER NOT NULL DEFAULT 0,
        attrSOC INTEGER NOT NULL DEFAULT 0,
        attrUT INTEGER NOT NULL DEFAULT 0,
        UNIQUE(subject, courseCode, year, term),
        FOREIGN KEY (sourceId) REFERENCES SourceFetched(id)
    )
`);

// Create indexes for CourseAttribute
db.run(`CREATE INDEX IF NOT EXISTS idx_courseattr_subject ON CourseAttribute(subject)`);

// Create CourseSummary table for parsed catalogue data
db.run(`
    CREATE TABLE IF NOT EXISTS CourseSummary (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sourceId INTEGER NOT NULL,
        subject TEXT NOT NULL,
        courseCode TEXT NOT NULL,
        year INTEGER NOT NULL,
        term INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        descReplacementCourse TEXT,
        descRequisites TEXT,
        descLastUpdated TEXT,
        credits REAL NOT NULL,
        hoursLecture REAL NOT NULL,
        hoursSeminar REAL NOT NULL,
        hoursLab REAL NOT NULL,
        UNIQUE(subject, courseCode, year, term),
        FOREIGN KEY (sourceId) REFERENCES SourceFetched(id)
    )
`);

// Create indexes for CourseSummary
db.run(`CREATE INDEX IF NOT EXISTS idx_coursesummary_subject ON CourseSummary(subject)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_coursesummary_year_term ON CourseSummary(year, term)`);

// Create Section table for parsed semester search data
db.run(`
    CREATE TABLE IF NOT EXISTS Section (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sourceId INTEGER NOT NULL,
        subject TEXT NOT NULL,
        courseCode TEXT NOT NULL,
        year INTEGER NOT NULL,
        term INTEGER NOT NULL,
        crn INTEGER NOT NULL,
        section TEXT,
        credits REAL NOT NULL,
        abbreviatedTitle TEXT,
        rp TEXT,
        seats TEXT,
        waitlist TEXT,
        addFees REAL,
        rptLimit INTEGER,
        notes TEXT,
        UNIQUE(subject, courseCode, year, term, crn),
        FOREIGN KEY (sourceId) REFERENCES SourceFetched(id)
    )
`);

// Create indexes for Section
db.run(`CREATE INDEX IF NOT EXISTS idx_section_subject ON Section(subject)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_section_year_term ON Section(year, term)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_section_crn ON Section(crn)`);
// Covering index for offered_online queries (subject + courseCode + section + year + term)
db.run(`CREATE INDEX IF NOT EXISTS idx_section_course_online ON Section(subject, courseCode, section, year, term)`);

// Create ScheduleEntry table for section schedules
db.run(`
    CREATE TABLE IF NOT EXISTS ScheduleEntry (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sourceId INTEGER NOT NULL,
        subject TEXT NOT NULL,
        courseCode TEXT NOT NULL,
        year INTEGER NOT NULL,
        term INTEGER NOT NULL,
        crn INTEGER NOT NULL,
        scheduleIndex INTEGER NOT NULL,
        type TEXT NOT NULL,
        days TEXT NOT NULL,
        time TEXT NOT NULL,
        start TEXT,
        end TEXT,
        room TEXT NOT NULL,
        instructor TEXT NOT NULL,
        UNIQUE(subject, courseCode, year, term, crn, scheduleIndex),
        FOREIGN KEY (sourceId) REFERENCES SourceFetched(id)
    )
`);

// Create indexes for ScheduleEntry
db.run(`CREATE INDEX IF NOT EXISTS idx_schedule_crn ON ScheduleEntry(crn)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_schedule_year_term ON ScheduleEntry(year, term)`);

// Create LangaraCourseDetail table for data scraped from langara.ca course pages
db.run(`
    CREATE TABLE IF NOT EXISTS LangaraCourseDetail (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sourceId INTEGER NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        subject TEXT NOT NULL,
        courseCode TEXT NOT NULL,
        title TEXT,
        studyType TEXT,
        lectureHours REAL,
        seminarHours REAL,
        labHours REAL,
        credits REAL,
        description TEXT,
        descDegreeRequirements TEXT,
        descPrerequisites TEXT,
        descCorequisites TEXT,
        courseOutlineUrl TEXT,
        FOREIGN KEY (sourceId) REFERENCES SourceFetched(id)
    )
`);
db.run(`CREATE INDEX IF NOT EXISTS idx_langara_course_subject ON LangaraCourseDetail(subject)`);

// Unified Course view — merges all four data sources.
// Each source independently contributes the most recent data it has.
// LangaraCourseDetail (langara.ca) takes precedence over CourseSummary (catalogue)
// for overlapping fields. CourseAttribute provides the latest degree-requirement flags.
db.run(`
    CREATE VIEW IF NOT EXISTS Course AS
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
        c.subject,
        c.courseCode,
        COALESCE(lcd.title,        lcat.title)          AS title,
        CASE WHEN lcd.slug IS NOT NULL THEN 1 ELSE 0 END AS onLangaraWebsite,
        lcd.studyType,
        COALESCE(lcd.credits,      lcat.credits)        AS credits,
        COALESCE(lcd.lectureHours, lcat.hoursLecture)   AS lectureHours,
        COALESCE(lcd.seminarHours, lcat.hoursSeminar)   AS seminarHours,
        COALESCE(lcd.labHours,     lcat.hoursLab)       AS labHours,
        COALESCE(lcd.description,  lcat.description)    AS description,
        lcd.descPrerequisites,
        lcd.descCorequisites,
        lcd.descDegreeRequirements,
        lcat.descRequisites                             AS descRequisitesCatalogue,
        lcat.descReplacementCourse,
        lcd.courseOutlineUrl,
        la.attr2AR, la.attr2SC, la.attrHUM, la.attrLSC,
        la.attrSCI, la.attrSOC, la.attrUT
    FROM all_courses c
    LEFT JOIN LangaraCourseDetail lcd
           ON lcd.subject = c.subject AND lcd.courseCode = c.courseCode
    LEFT JOIN latest_catalogue lcat
           ON lcat.subject = c.subject AND lcat.courseCode = c.courseCode
    LEFT JOIN latest_attribute la
           ON la.subject = c.subject AND la.courseCode = c.courseCode
`);
async function getContent(contentLink: string): Promise<string> {
    if (contentLink.startsWith("file://")) {
        const filepath = contentLink.slice(7); // Remove "file://" prefix
        return await readFile(filepath, "utf-8");
    }
    throw new Error(`Unsupported content link format: ${contentLink}`);
}

// Main parser that routes to the appropriate parser
async function parseContent(sourceType: Source['sourceType'], content: string, sourceIdentifier: string, sourceId: number): Promise<void> {
    switch (sourceType) {
        case 'SemesterSearch':
            await parseSemesterSearch(content, sourceIdentifier, sourceId, db);
            break;
        case 'SemesterCatalogue':
            await parseSemesterCatalogue(content, sourceIdentifier, sourceId, db);
            break;
        case 'SemesterAttributes':
            await parseSemesterAttributes(content, sourceIdentifier, sourceId, db);
            break;
        case 'TransferCredits':
            await parseTransferCredits(content, sourceIdentifier, sourceId, db);
            break;
        case 'LangaraCoursePage':
            await parseLangaraCoursePage(content, sourceIdentifier, sourceId, db);
            break;
        // Meta tasks (DiscoverSemesters, DiscoverTransferSubjects, DiscoverLangaraCourses) are
        // marked parsed=1 at fetch time and never appear in the unparsed queue.
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
        await parseContent(record.sourceType, content, record.sourceIdentifier, record.sourceId);
        
        // Mark as parsed
        db.run(`UPDATE SourceFetched SET parsed = 1 WHERE id = ?`, [record.id]);
        
        // console.log(`  Parsed successfully`);
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
    let consecutiveBusyErrors = 0;
    
    while (true) {
        try {
            const unparsedRecords = getUnparsedRecords();
            consecutiveBusyErrors = 0;

            if (unparsedRecords.length > 0) {
                console.log(`Found ${unparsedRecords.length} unparsed records`);

                for (const record of unparsedRecords) {
                    await processSourceFetched(record);
                }
            } else {
                console.log("No unparsed records. Checking again in 30 seconds.");
            }
        } catch (error) {
            if (isSqliteBusyError(error)) {
                consecutiveBusyErrors += 1;
                const busyBackoffMs = Math.min(1000 * Math.pow(2, consecutiveBusyErrors), 30000);
                console.warn(`[Parser] SQLite busy/locked; retrying in ${busyBackoffMs}ms (attempt ${consecutiveBusyErrors}).`);
                await new Promise(resolve => setTimeout(resolve, busyBackoffMs));
                continue;
            }

            console.error("[Parser] Unexpected main loop error:", error);
            await new Promise(resolve => setTimeout(resolve, 30000));
        }
        
        // Wait before checking again
        await new Promise(resolve => setTimeout(resolve, 30000));
    }
}

// Run the main loop
main().catch(console.error);
