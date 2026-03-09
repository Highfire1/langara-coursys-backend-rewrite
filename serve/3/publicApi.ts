import { Elysia, t } from "elysia";
import { openapi, fromTypes } from "@elysiajs/openapi";
import { cors } from "@elysiajs/cors";
import { Database } from "bun:sqlite";

const headers = { "Content-Type": "application/json" } as const;

function getLatestSemester(db: Database) {
    const row = db
        .query(`
            SELECT DISTINCT year, term FROM CourseSummary 
            ORDER BY year DESC, 
                     CASE term WHEN 30 THEN 0 WHEN 20 THEN 1 WHEN 10 THEN 2 END ASC 
            LIMIT 1
        `)
        .get() as { term: number; year: number } | undefined;
    return row || { term: 10, year: 2024 };
}

function getAllSemesters(db: Database) {
    const rows = db
        .query(`SELECT DISTINCT year, term FROM CourseSummary ORDER BY year DESC, term DESC`)
        .all() as Array<{ year: number; term: number }>;
    return {
        count: rows.length,
        semesters: rows,
    };
}

function getAllSubjects(db: Database, all: boolean) {
    // When `all` is false (default), only return subjects that have at least one section.
    // When `all` is true, also include subjects that only appear in CourseSummary (pre-1999 etc.)
    const rows = all
        ? db.query(`
            SELECT DISTINCT subject FROM (
                SELECT subject FROM Section
                UNION SELECT subject FROM CourseSummary
            ) ORDER BY subject ASC
          `).all() as Array<{ subject: string }>
        : db.query(`SELECT DISTINCT subject FROM Section ORDER BY subject ASC`)
              .all() as Array<{ subject: string }>;
    return {
        count: rows.length,
        subjects: rows.map(r => r.subject),
    };
}

function getAllCourses(db: Database) {
    const rows = db.query(
        `SELECT subject, courseCode, title, onLangaraWebsite FROM _CourseCache ORDER BY subject ASC, courseCode ASC`
    ).all() as Array<{ subject: string; courseCode: string; title: string | null; onLangaraWebsite: number }>;

    const subjects = new Set(rows.map(r => r.subject));
    return {
        subject_count: subjects.size,
        course_count: rows.length,
        courses: rows.map(r => ({
            subject: r.subject,
            course_code: r.courseCode,
            title: r.title,
            on_langara_website: r.onLangaraWebsite === 1,
        })),
    };
}

// ─── Shared helpers ──────────────────────────────────────────────────────────

function shapeCourseRow(row: any) {
    return {
        subject:                   row.subject,
        course_code:               row.courseCode,
        title:                     row.title,
        on_langara_website:        row.onLangaraWebsite === 1,
        study_type:                row.studyType,
        credits:                   row.credits,
        lecture_hours:             row.lectureHours,
        seminar_hours:             row.seminarHours,
        lab_hours:                 row.labHours,
        description:               row.description,
        desc_prerequisites:        row.descPrerequisites,
        desc_corequisites:         row.descCorequisites,
        desc_degree_requirements:  row.descDegreeRequirements,
        desc_requisites_catalogue: row.descRequisitesCatalogue,
        desc_replacement_course:   row.descReplacementCourse,
        attributes: {
            attr_2ar: row.attr2AR === 1,
            attr_2sc: row.attr2SC === 1,
            attr_hum: row.attrHUM === 1,
            attr_lsc: row.attrLSC === 1,
            attr_sci: row.attrSCI === 1,
            attr_soc: row.attrSOC === 1,
            attr_ut:  row.attrUT  === 1,
        },
    };
}

/** Aggregate flat Section + ScheduleEntry rows into nested SectionAPI objects */
function shapeSections(sections: any[], scheduleRows: any[]) {
    const scheduleByKey = new Map<string, any[]>();
    for (const se of scheduleRows) {
        const key = `${se.crn}-${se.year}-${se.term}`;
        if (!scheduleByKey.has(key)) scheduleByKey.set(key, []);
        scheduleByKey.get(key)!.push({
            type:       se.type,
            days:       se.days,
            time:       se.time,
            start:      se.start,
            end:        se.end,
            room:       se.room,
            instructor: se.instructor,
        });
    }
    return sections.map(s => ({
        year:              s.year,
        term:              s.term,
        crn:               s.crn,
        subject:           s.subject,
        course_code:       s.courseCode,
        section:           s.section,
        credits:           s.credits,
        abbreviated_title: s.abbreviatedTitle,
        rp:                s.rp,
        seats:             s.seats,
        waitlist:          s.waitlist,
        add_fees:          s.addFees,
        rpt_limit:         s.rptLimit,
        notes:             s.notes,
        schedule:          scheduleByKey.get(`${s.crn}-${s.year}-${s.term}`) ?? [],
    }));
}

// ─── Course detail ────────────────────────────────────────────────────────────

function getCourse(db: Database, subject: string, courseCode: string) {
    const row = db.query(
        `SELECT * FROM _CourseCache WHERE subject = ? AND courseCode = ?`
    ).get(subject.toUpperCase(), courseCode) as any;
    if (!row) return null;

    const sectionRows = db.query(`
        SELECT * FROM Section WHERE subject = ? AND courseCode = ?
        ORDER BY year DESC, term DESC, crn
    `).all(subject.toUpperCase(), courseCode) as any[];

    const crns = sectionRows.map(s => s.crn);
    const scheduleRows = crns.length
        ? db.query(`
            SELECT se.* FROM ScheduleEntry se
            INNER JOIN Section s ON s.crn = se.crn AND s.year = se.year AND s.term = se.term
            WHERE s.subject = ? AND s.courseCode = ?
            ORDER BY se.crn, se.year, se.term, se.scheduleIndex
          `).all(subject.toUpperCase(), courseCode) as any[]
        : [];

    const transfers = db.query(`
        SELECT * FROM Transfer WHERE subject = ? AND courseNumber = ?
        ORDER BY effectiveEnd IS NULL DESC, effectiveStart DESC
    `).all(subject.toUpperCase(), courseCode) as any[];

    const outlines = row.courseOutlineUrl
        ? [{ url: row.courseOutlineUrl, file_name: `${subject.toUpperCase()} ${courseCode} Course Outline` }]
        : [];

    return {
        ...shapeCourseRow(row),
        course_outline_url: row.courseOutlineUrl,
        sections:  shapeSections(sectionRows, scheduleRows),
        transfers: transfers,
        outlines:  outlines,
    };
}

// ─── Semester endpoints ───────────────────────────────────────────────────────

function getSemesterCourses(db: Database, year: number, term: number) {
    const rows = db.query(`
        SELECT DISTINCT c.*
        FROM _CourseCache c
        INNER JOIN Section s ON s.subject = c.subject AND s.courseCode = c.courseCode
        WHERE s.year = ? AND s.term = ?
        ORDER BY c.subject, c.courseCode
    `).all(year, term) as any[];
    return { year, term, count: rows.length, courses: rows.map(shapeCourseRow) };
}

function getSemesterSections(db: Database, year: number, term: number) {
    const sections = db.query(`
        SELECT * FROM Section WHERE year = ? AND term = ?
        ORDER BY subject, courseCode, crn
    `).all(year, term) as any[];
    const scheduleRows = db.query(`
        SELECT * FROM ScheduleEntry WHERE year = ? AND term = ?
        ORDER BY crn, scheduleIndex
    `).all(year, term) as any[];
    return { year, term, count: sections.length, sections: shapeSections(sections, scheduleRows) };
}

function getSection(db: Database, year: number, term: number, crn: number) {
    const section = db.query(
        `SELECT * FROM Section WHERE year = ? AND term = ? AND crn = ?`
    ).get(year, term, crn) as any;
    if (!section) return null;
    const scheduleRows = db.query(`
        SELECT * FROM ScheduleEntry WHERE year = ? AND term = ? AND crn = ?
        ORDER BY scheduleIndex
    `).all(year, term, crn) as any[];
    return shapeSections([section], scheduleRows)[0];
}

// ─── Search endpoints ─────────────────────────────────────────────────────────

function searchSections(db: Database, params: {
    query?: string; year?: number; term?: number; online?: boolean;
}) {
    const conditions: string[] = [];
    const args: any[] = [];
    if (params.year)  { conditions.push(`s.year = ?`);  args.push(params.year); }
    if (params.term)  { conditions.push(`s.term = ?`);  args.push(params.term); }
    if (params.query) {
        const raw = params.query.trim();
        // Detect "SUBJECT code" pattern — with or without space e.g. "cpsc 1150", "cpsc1", "CPSC 11"
        const subjectCodeMatch = raw.match(/^([a-zA-Z]+)\s*(\d\S*)$/);
        if (subjectCodeMatch) {
            const subj = subjectCodeMatch[1].toUpperCase();
            const code = `${subjectCodeMatch[2]}%`;
            conditions.push(`(s.subject = ? AND s.courseCode LIKE ?)`);
            args.push(subj, code);
        } else {
            const q = `%${raw}%`;
            conditions.push(`(
                s.subject LIKE ? OR s.courseCode LIKE ? OR s.abbreviatedTitle LIKE ?
                OR EXISTS (
                    SELECT 1 FROM ScheduleEntry se
                    WHERE se.crn = s.crn AND se.year = s.year AND se.term = s.term
                    AND se.instructor LIKE ?
                )
            )`);
            args.push(q, q, q, q);
        }
    }
    const onlineJoin = params.online === true
        ? `INNER JOIN _OnlineSections _os ON _os.crn = s.crn AND _os.year = s.year AND _os.term = s.term`
        : '';
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = db.query(`
        SELECT DISTINCT s.year, s.term, s.crn, s.subject, s.courseCode,
               s.section, s.abbreviatedTitle, s.credits, s.seats, s.waitlist
        FROM Section s
        ${onlineJoin}
        ${where}
        ORDER BY s.subject, s.courseCode, s.crn
    `).all(...args) as any[];
    return {
        count: rows.length,
        sections: rows.map(s => ({
            year: s.year, term: s.term, crn: s.crn,
            subject: s.subject, course_code: s.courseCode,
            section: s.section, abbreviated_title: s.abbreviatedTitle,
            credits: s.credits, seats: s.seats, waitlist: s.waitlist,
        })),
    };
}

function searchSectionsAdvanced(db: Database, params: {
    subject?: string; course_code?: string; year?: number; term?: number;
    title_search?: string; instructor_search?: string;
    online?: boolean;
    attr_2ar?: boolean; attr_2sc?: boolean; attr_hum?: boolean;
    attr_lsc?: boolean; attr_sci?: boolean; attr_soc?: boolean; attr_ut?: boolean;
    filter_open_seats?: boolean; filter_no_waitlist?: boolean; filter_not_cancelled?: boolean;
    page?: number; sections_per_page?: number;
    sort?: 'newest' | 'oldest' | 'course_asc' | 'course_desc';
}) {
    const page             = Math.max(1, params.page             ?? 1);
    const sections_per_page = Math.min(200, Math.max(1, params.sections_per_page ?? 100));
    const offset           = (page - 1) * sections_per_page;
    const orderBy = params.sort === 'newest'     ? `s.year DESC, s.term DESC, s.subject ASC,  s.courseCode ASC`
                  : params.sort === 'oldest'     ? `s.year ASC,  s.term ASC,  s.subject ASC,  s.courseCode ASC`
                  : params.sort === 'course_desc'? `s.subject DESC, s.courseCode DESC, s.year DESC, s.term DESC`
                  :                               `s.subject ASC,  s.courseCode ASC,  s.year DESC, s.term DESC`;

    const conditions: string[] = [];
    const args: any[] = [];

    if (params.year)        { conditions.push(`s.year = ?`);         args.push(params.year); }
    if (params.term)        { conditions.push(`s.term = ?`);         args.push(params.term); }
    if (params.subject)     { conditions.push(`s.subject = ?`);      args.push(params.subject.toUpperCase()); }
    if (params.course_code) { conditions.push(`s.courseCode = ?`);   args.push(params.course_code); }
    if (params.title_search) {
        const q = `%${params.title_search}%`;
        conditions.push(`s.abbreviatedTitle LIKE ?`);
        args.push(q);
    }
    if (params.instructor_search) {
        const q = `%${params.instructor_search}%`;
        conditions.push(`EXISTS (
            SELECT 1 FROM ScheduleEntry se
            WHERE se.crn = s.crn AND se.year = s.year AND se.term = s.term
            AND se.instructor LIKE ?
        )`);
        args.push(q);
    }
    const onlineJoin = params.online === true
        ? `INNER JOIN _OnlineSections _os ON _os.crn = s.crn AND _os.year = s.year AND _os.term = s.term`
        : '';
    if (params.filter_open_seats)    { conditions.push(`(CAST(s.seats AS INTEGER) > 0)`); }
    if (params.filter_no_waitlist)   { conditions.push(`(s.waitlist IS NULL OR s.waitlist = '' OR CAST(s.waitlist AS INTEGER) = 0)`); }
    if (params.filter_not_cancelled) { conditions.push(`s.seats NOT LIKE 'Cancel%' AND s.seats NOT LIKE 'Inact%'`); }

    const attrMap: [keyof typeof params, string][] = [
        ['attr_2ar', 'attr2AR'], ['attr_2sc', 'attr2SC'], ['attr_hum', 'attrHUM'],
        ['attr_lsc', 'attrLSC'], ['attr_sci', 'attrSCI'], ['attr_soc', 'attrSOC'],
        ['attr_ut',  'attrUT'],
    ];
    const attrFilters: string[] = [];
    for (const [param, col] of attrMap) {
        if (params[param] === true) attrFilters.push(`c.${col} = 1`);
    }
    // Use the pre-materialized _CourseCache table instead of the expensive
    // multi-CTE Course VIEW so attribute filtering is a simple indexed JOIN.
    const attrJoin = attrFilters.length
        ? `INNER JOIN _CourseCache c ON c.subject = s.subject AND c.courseCode = s.courseCode AND ${attrFilters.join(' AND ')}`
        : '';

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const total = (db.query(`
        SELECT COUNT(*) as n FROM Section s ${attrJoin} ${onlineJoin} ${where}
    `).get(...args) as any).n as number;

    const sections = db.query(`
        SELECT s.* FROM Section s ${attrJoin} ${onlineJoin} ${where}
        ORDER BY ${orderBy}
        LIMIT ? OFFSET ?
    `).all(...args, sections_per_page, offset) as any[];

    // Fetch schedule entries scoped to the exact (crn, year, term) tuples on this
    // page — avoids pulling cross-semester duplicates when the same CRN repeats.
    let scheduleRows: any[] = [];
    if (sections.length > 0) {
        const uniqueYearTerms = [...new Set(sections.map((s: any) => `${s.year}_${s.term}`))];
        if (uniqueYearTerms.length === 1) {
            // Common fast path: all sections on the page share the same semester.
            const [year, term] = uniqueYearTerms[0].split('_').map(Number);
            const crns = sections.map((s: any) => s.crn);
            scheduleRows = db.query(`
                SELECT se.* FROM ScheduleEntry se
                WHERE se.year = ? AND se.term = ?
                  AND se.crn IN (${crns.map(() => '?').join(',')})
                ORDER BY se.crn, se.scheduleIndex
            `).all(year, term, ...crns) as any[];
        } else {
            // Sections span multiple semesters — still restrict by crn to avoid a
            // full table scan, but keep the Section JOIN for year+term validation.
            const crns = [...new Set(sections.map((s: any) => s.crn))];
            scheduleRows = db.query(`
                SELECT se.* FROM ScheduleEntry se
                INNER JOIN Section s ON s.crn = se.crn AND s.year = se.year AND s.term = se.term
                WHERE se.crn IN (${crns.map(() => '?').join(',')})
                ORDER BY se.crn, se.year, se.term, se.scheduleIndex
            `).all(...crns) as any[];
        }
    }

    return {
        page, sections_per_page,
        total_count: total,
        total_pages: Math.ceil(total / sections_per_page),
        sections: shapeSections(sections, scheduleRows),
    };
}

// Simple course search — lightweight index results (matches /v1/search/courses)
function searchCoursesSimple(db: Database, params: {
    query?: string;
    attr_2ar?: boolean; attr_2sc?: boolean; attr_hum?: boolean;
    attr_lsc?: boolean; attr_sci?: boolean; attr_soc?: boolean; attr_ut?: boolean;
    transfers_to?: string[];
    on_langara_website?: boolean;
}) {
    const conditions: string[] = [];
    const args: any[] = [];

    if (params.query) {
        const q = `%${params.query}%`;
        conditions.push(`(subject LIKE ? OR courseCode LIKE ? OR title LIKE ? OR description LIKE ?)`);
        args.push(q, q, q, q);
    }
    const attrMap: [keyof typeof params, string][] = [
        ['attr_2ar', 'attr2AR'], ['attr_2sc', 'attr2SC'], ['attr_hum', 'attrHUM'],
        ['attr_lsc', 'attrLSC'], ['attr_sci', 'attrSCI'], ['attr_soc', 'attrSOC'],
        ['attr_ut',  'attrUT'],
    ];
    for (const [param, col] of attrMap) {
        if (params[param] === true) { conditions.push(`${col} = 1`); }
    }
    if (params.on_langara_website === true) { conditions.push(`onLangaraWebsite = 1`); }
    if (params.transfers_to && params.transfers_to.length > 0) {
        for (const dest of params.transfers_to) {
            conditions.push(`EXISTS (SELECT 1 FROM Transfer t WHERE t.subject = subject AND t.courseNumber = courseCode AND t.destination = ?)`);
            args.push(dest.toUpperCase());
        }
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = db.query(`
        SELECT subject, courseCode, title, onLangaraWebsite FROM _CourseCache ${where}
        ORDER BY subject, courseCode
    `).all(...args) as any[];

    return {
        count: rows.length,
        courses: rows.map(r => ({
            subject: r.subject,
            course_code: r.courseCode,
            title: r.title,
            on_langara_website: r.onLangaraWebsite === 1,
        })),
    };
}

// Pre-compute last 6 semesters (cached per request context)
function getLastNSemesters(db: Database, n = 6): number[] {
    const rows = db.query(`
        SELECT DISTINCT year * 100 + term AS semKey
        FROM Section
        ORDER BY semKey DESC
        LIMIT ?
    `).all(n) as Array<{ semKey: number }>;
    return rows.map(r => r.semKey);
}

// Full course search — paginated with rich filters (matches /v2/search/courses)
function searchCourses(db: Database, params: {
    query?: string; title_search?: string; subject?: string; course_code?: string;
    attr_2ar?: boolean; attr_2sc?: boolean; attr_hum?: boolean;
    attr_lsc?: boolean; attr_sci?: boolean; attr_soc?: boolean; attr_ut?: boolean;
    credits?: number;
    on_langara_website?: boolean;
    offered_online?: boolean;
    prerequisites?: boolean;
    transfer_destinations?: string[];
    page?: number; limit?: number;
}) {
    const page   = Math.max(1, params.page  ?? 1);
    const limit  = Math.min(200, Math.max(1, params.limit ?? 20));
    const offset = (page - 1) * limit;

    // Pre-compute recent semesters ONCE if needed
    const recentSemesters = getLastNSemesters(db, 6);
    const semPlaceholders = recentSemesters.map(() => '?').join(',');

    // Step 1: Build filtered course list using INNER JOIN for offered_online
    const conditions: string[] = [];
    const args: any[] = [];

    if (params.subject)      { conditions.push(`c.subject = ?`);    args.push(params.subject.toUpperCase()); }
    if (params.course_code)  { conditions.push(`c.courseCode = ?`); args.push(params.course_code); }
    if (params.title_search) {
        conditions.push(`c.title LIKE ?`);
        args.push(`%${params.title_search}%`);
    }
    if (params.query) {
        const q = `%${params.query}%`;
        conditions.push(`(c.subject LIKE ? OR c.courseCode LIKE ? OR c.title LIKE ? OR c.description LIKE ?)`);
        args.push(q, q, q, q);
    }
    if (params.credits != null)          { conditions.push(`c.credits = ?`);            args.push(params.credits); }
    if (params.on_langara_website === true) { conditions.push(`c.onLangaraWebsite = 1`); }
    if (params.prerequisites === true)   { conditions.push(`(c.descPrerequisites IS NOT NULL AND c.descPrerequisites != '') OR (c.descRequisitesCatalogue IS NOT NULL AND c.descRequisitesCatalogue != '')`); }
    
    const attrMap: [keyof typeof params, string][] = [
        ['attr_2ar', 'attr2AR'], ['attr_2sc', 'attr2SC'], ['attr_hum', 'attrHUM'],
        ['attr_lsc', 'attrLSC'], ['attr_sci', 'attrSCI'], ['attr_soc', 'attrSOC'],
        ['attr_ut',  'attrUT'],
    ];
    for (const [param, col] of attrMap) {
        if (params[param] === true) { conditions.push(`c.${col} = 1`); }
    }
    if (params.transfer_destinations && params.transfer_destinations.length > 0) {
        for (const dest of params.transfer_destinations) {
            conditions.push(`EXISTS (SELECT 1 FROM Transfer t WHERE t.subject = c.subject AND t.courseNumber = c.courseCode AND t.destination = ?)`);
            args.push(dest.toUpperCase());
        }
    }

    // Use INNER JOIN for offered_online filter (much faster than subquery in WHERE)
    const onlineJoin = params.offered_online === true
        ? `INNER JOIN (
            SELECT DISTINCT subject, courseCode
            FROM Section
            WHERE section LIKE 'W%' AND (year * 100 + term) IN (${semPlaceholders})
        ) online_filter ON online_filter.subject = c.subject AND online_filter.courseCode = c.courseCode`
        : '';

    const onlineArgs = params.offered_online === true ? [...recentSemesters] : [];
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count query (fast - just counts filtered courses)
    const countArgs = [...onlineArgs, ...args];
    const total = (db.query(`
        SELECT COUNT(*) as n FROM _CourseCache c
        ${onlineJoin}
        ${where}
    `).get(...countArgs) as any).n as number;

    // Step 2: Get paginated course IDs first
    const courseIdArgs = [...onlineArgs, ...args, limit, offset];
    const courseIds = db.query(`
        SELECT c.subject, c.courseCode FROM _CourseCache c
        ${onlineJoin}
        ${where}
        ORDER BY c.subject, c.courseCode
        LIMIT ? OFFSET ?
    `).all(...courseIdArgs) as Array<{ subject: string; courseCode: string }>;

    if (courseIds.length === 0) {
        return { page, limit, total_count: total, total_pages: Math.ceil(total / limit), courses: [] };
    }

    // Step 3: Build IN clause for the filtered courses
    const courseKeys = courseIds.map(c => `${c.subject}|${c.courseCode}`);
    const coursePlaceholders = courseIds.map(() => '(?, ?)').join(',');
    const courseArgs = courseIds.flatMap(c => [c.subject, c.courseCode]);

    // Step 4: Get full course data with aggregates for ONLY the filtered courses
    const rows = db.query(`
        SELECT c.*,
            EXISTS (
                SELECT 1 FROM Section s
                WHERE s.subject = c.subject AND s.courseCode = c.courseCode
                AND s.section LIKE 'W%'
                AND (s.year * 100 + s.term) IN (${semPlaceholders})
            ) AS offeredOnline,
            section_agg.firstYear AS firstOfferedYear,
            section_agg.firstTerm AS firstOfferedTerm,
            section_agg.lastYear AS lastOfferedYear,
            section_agg.lastTerm AS lastOfferedTerm,
            transfer_agg.destinations AS transferDestinations
        FROM _CourseCache c
        LEFT JOIN (
            SELECT subject, courseCode,
                   MIN(year * 100 + term) / 100 AS firstYear,
                   MIN(year * 100 + term) % 100 AS firstTerm,
                   MAX(year * 100 + term) / 100 AS lastYear,
                   MAX(year * 100 + term) % 100 AS lastTerm
            FROM Section
            WHERE (subject, courseCode) IN (${coursePlaceholders})
            GROUP BY subject, courseCode
        ) section_agg ON section_agg.subject = c.subject AND section_agg.courseCode = c.courseCode
        LEFT JOIN (
            SELECT subject, courseNumber, GROUP_CONCAT(DISTINCT destination) as destinations
            FROM Transfer
            WHERE (subject, courseNumber) IN (${coursePlaceholders})
            GROUP BY subject, courseNumber
        ) transfer_agg ON transfer_agg.subject = c.subject AND transfer_agg.courseNumber = c.courseCode
        WHERE (c.subject, c.courseCode) IN (${coursePlaceholders})
        ORDER BY c.subject, c.courseCode
    `).all(...recentSemesters, ...courseArgs, ...courseArgs, ...courseArgs) as any[];

    return {
        page, limit,
        total_count: total,
        total_pages: Math.ceil(total / limit),
        courses: rows.map(r => ({
            ...shapeCourseRow(r),
            offered_online:      r.offeredOnline === 1,
            first_offered_year:  r.firstOfferedYear  ?? null,
            first_offered_term:  r.firstOfferedTerm  ?? null,
            last_offered_year:   r.lastOfferedYear   ?? null,
            last_offered_term:   r.lastOfferedTerm   ?? null,
            transfer_destinations: r.transferDestinations ?? null,
        })),
    };
}

// ─── Transfer by institution ──────────────────────────────────────────────────

function getTransfersByInstitution(db: Database, institution: string) {
    const rows = db.query(`
        SELECT * FROM Transfer WHERE destination = ?
        ORDER BY subject, courseNumber, effectiveEnd IS NULL DESC, effectiveStart DESC
    `).all(institution.toUpperCase()) as any[];
    return { institution: institution.toUpperCase(), count: rows.length, transfers: rows };
}

function getCourseTransfers(db: Database, subject: string, courseCode: string) {
    const rows = db.query(`
        SELECT * FROM Transfer
        WHERE subject = ? AND courseNumber = ?
        ORDER BY effectiveEnd IS NULL DESC, effectiveStart DESC
    `).all(subject.toUpperCase(), courseCode) as any[];
    return {
        subject: subject.toUpperCase(),
        course_code: courseCode,
        count: rows.length,
        transfers: rows,
    };
}

function getTransferDestinations(db: Database) {
    const transfers = db
        .query(`SELECT DISTINCT destination as code, destinationName as name FROM Transfer ORDER BY name ASC`)
        .all() as Array<{ code: string; name: string }>;
    return {
        count: transfers.length,
        transfers: transfers,
    };
}

// ─── Status endpoint ──────────────────────────────────────────────────────────

function getApiStatus(db: Database) {
    // Determine overall status
    let status: "ready" | "initializing" | "error" = "ready";
    try {
        const unfetchedCount = (db.query(
            `SELECT COUNT(*) as n FROM Source WHERE isActive = 1 AND lastFetched IS NULL`
        ).get() as any).n as number;
        if (unfetchedCount > 0) status = "initializing";
    } catch {
        status = "error";
    }

    // Per-type source stats
    const sourceStats = db.query(`
        SELECT
            sourceType,
            COUNT(*)                                                                          AS total,
            SUM(CASE WHEN isActive = 1 THEN 1 ELSE 0 END)                                   AS active,
            SUM(CASE WHEN nextFetch <= datetime('now') AND isActive = 1 THEN 1 ELSE 0 END)   AS pending,
            MAX(lastFetched)                                                                  AS last_fetched,
            MIN(CASE WHEN isActive = 1 THEN nextFetch ELSE NULL END)                         AS next_fetch
        FROM Source
        GROUP BY sourceType
        ORDER BY sourceType
    `).all() as Array<{
        sourceType: string; total: number; active: number; pending: number;
        last_fetched: string | null; next_fetch: string | null;
    }>;

    // Latest / earliest semester available
    const latestSemester  = db.query(`SELECT year, term FROM CourseSummary ORDER BY year DESC, term DESC LIMIT 1`).get() as { year: number; term: number } | null;
    const earliestSemester = db.query(`SELECT year, term FROM CourseSummary ORDER BY year ASC,  term ASC  LIMIT 1`).get() as { year: number; term: number } | null;

    // Row counts
    const counts = db.query(`
        SELECT
            (SELECT COUNT(*) FROM _CourseCache)     AS courses,
            (SELECT COUNT(*) FROM Section)          AS sections,
            (SELECT COUNT(*) FROM Transfer)         AS transfers,
            (SELECT COUNT(*) FROM LangaraCourseDetail) AS langara_pages,
            (SELECT COUNT(DISTINCT year || term) FROM CourseSummary) AS semesters
    `).get() as { courses: number; sections: number; transfers: number; langara_pages: number; semesters: number };

    return {
        status,
        database: {
            courses:       counts.courses,
            sections:      counts.sections,
            transfers:     counts.transfers,
            langara_pages: counts.langara_pages,
            semesters:     counts.semesters,
        },
        latest_semester:   latestSemester,
        earliest_semester: earliestSemester,
        sources: sourceStats.map(s => ({
            type:         s.sourceType,
            total:        s.total,
            active:       s.active,
            pending:      s.pending,
            last_fetched: s.last_fetched,
            next_fetch:   s.next_fetch,
        })),
    };
}

// ─── Cache helpers ───────────────────────────────────────────────────────────

/** Returns seconds until the next scheduled fetch for the given source types, clamped to [60, 604800]. */
function getCacheMaxAge(db: Database, sourceTypes: string[]): number {
    const placeholders = sourceTypes.map(() => '?').join(',');
    const row = db.query(
        `SELECT MIN(nextFetch) as next FROM Source WHERE sourceType IN (${placeholders}) AND isActive = 1`
    ).get(...sourceTypes) as { next: string | null } | null;
    if (!row?.next) return 3600;
    const seconds = Math.floor((new Date(row.next).getTime() - Date.now()) / 1000);
    return Math.max(60, Math.min(seconds, 604800)); // clamp: 1 min → 1 week
}

export function createPublicApi(db: Database) {
    return new Elysia( { strictPath: true } )
        .use(cors({ origin: '*' }))
        .use(openapi({
            path: "/api",
            documentation: {
                info: {
                    title: "Langara Course Data Public API",
                    version: "3.0.0",
                    description: "Public read-only API for course and transfer data",
                },
                tags: [
                    { name: "Health",    description: "Service health and version information" },
                    { name: "Index",     description: "Top-level index lists — semesters, subjects, and all courses" },
                    { name: "Semester",  description: "All courses or sections offered in a specific semester" },
                    { name: "Courses",   description: "Detailed information for individual courses" },
                    { name: "Search",    description: "Search and filter courses and sections" },
                    { name: "Transfers", description: "BC Transfer Guide credit transfer agreements" },
                ],
            },
            // references: fromTypes({ path: './types.ts' }),
        }))
        .onAfterHandle(({ path, set }) => {
            // No caching for health check or API docs
            if (!path.includes('v3')) return;
            // Status: short TTL so clients can poll initialisation progress
            if (path.includes('status')) {
                set.headers['Cache-Control'] = 'public, max-age=60, s-maxage=60';
                return;
            }
            // Transfer-primary routes: cache until next TransferCredits fetch
            if (path.includes('transfer')) {
                const maxAge = getCacheMaxAge(db, ['TransferCredits']);
                set.headers['Cache-Control'] = `public, max-age=${maxAge}, s-maxage=${maxAge}`;
                return;
            }
            // All other v3 routes: cache until next course/section data fetch
            const maxAge = getCacheMaxAge(db, ['SemesterSearch', 'SemesterCatalogue', 'SemesterAttributes', 'LangaraCoursePage']);
            set.headers['Cache-Control'] = `public, max-age=${maxAge}, s-maxage=${maxAge}`;
        })
        .get("api/health", () => ({
            status: "healthy",
            timestamp: new Date().toISOString(),
            database: "connected",
            version: "3.0.0",
        }), {
            detail: { tags: ["Health"], summary: "Health check" },
            response: t.Object({
                status: t.String(),
                timestamp: t.String(),
                database: t.String(),
                version: t.String(),
            })
        })
        .get("api/v3/status", () => getApiStatus(db), {
            detail: { tags: ["Health"], summary: "API and data status" },
        })
        .get("api/v3/index/latest_semester", () => getLatestSemester(db), {
            detail: { tags: ["Index"], summary: "Latest semester" },
            response: t.Object({
                term: t.Number(),
                year: t.Number(),
            })
        })
        .get("api/v3/index/semesters", () => getAllSemesters(db), {
            detail: { tags: ["Index"], summary: "All semesters" },
            response: t.Object({
                count: t.Number(),
                semesters: t.Array(t.Object({
                    term: t.Number(),
                    year: t.Number(),
                })),
            })
        })
        .get("api/v3/index/subjects", ({ query }) => getAllSubjects(db, query.all === 'true'), {
            detail: { tags: ["Index"], summary: "All subjects" },
            query: t.Object({ all: t.Optional(t.String()) }),
            response: t.Object({
                count: t.Number(),
                subjects: t.Array(t.String()),
            })
        })
        .get("api/v3/index/courses", () => getAllCourses(db), {
            detail: { tags: ["Index"], summary: "All courses (index)" },
            response: t.Object({
                subject_count: t.Number(),
                course_count: t.Number(),
                courses: t.Array(t.Object({
                    subject: t.String(),
                    course_code: t.String(),
                    title: t.Union([t.String(), t.Null()]),
                    on_langara_website: t.Boolean(),
                })),
            })
        })
        .get("api/v3/courses/:subject/:code", ({ params }) => {
            const course = getCourse(db, params.subject, params.code);
            if (!course) return new Response(JSON.stringify({ error: "Course not found" }), { status: 404, headers });
            return course;
        }, {
            detail: { tags: ["Courses"], summary: "Course detail with sections, transfers, and outlines" },
        })
        // ── Semester ──────────────────────────────────────────────────────────
        .get("api/v3/semester/:year/:term/courses", ({ params }) => {
            return getSemesterCourses(db, Number(params.year), Number(params.term));
        }, {
            detail: { tags: ["Semester"], summary: "Courses offered in a semester" },
        })
        .get("api/v3/semester/:year/:term/sections", ({ params }) => {
            return getSemesterSections(db, Number(params.year), Number(params.term));
        }, {
            detail: { tags: ["Semester"], summary: "All sections in a semester with schedules" },
        })
        .get("api/v3/section/:year/:term/:crn", ({ params }) => {
            const section = getSection(db, Number(params.year), Number(params.term), Number(params.crn));
            if (!section) return new Response(JSON.stringify({ error: "Section not found" }), { status: 404, headers });
            return section;
        }, {
            detail: { tags: ["Semester"], summary: "Single section detail" },
        })
        // ── Search ────────────────────────────────────────────────────────────
        .get("api/v3/search/sections", ({ query }) => {
            return searchSections(db, {
                query:  query.query  as string | undefined,
                year:   query.year   ? Number(query.year)   : undefined,
                term:   query.term   ? Number(query.term)   : undefined,
                online: query.online === 'true',
            });
        }, {
            detail: { tags: ["Search"], summary: "Search sections by keyword" },
            query: t.Object({
                query:  t.Optional(t.String()),
                year:   t.Optional(t.String()),
                term:   t.Optional(t.String()),
                online: t.Optional(t.String()),
            }),
        })
        .get("api/v3/search/sections/advanced", ({ query }) => {
            // transfer_destinations may come in as repeated params: ?transfer_destinations=UBCV&transfer_destinations=SFU
            const td = query.transfer_destinations;
            return searchSectionsAdvanced(db, {
                subject:              query.subject              as string | undefined,
                course_code:          query.course_code          as string | undefined,
                year:                 query.year                 ? Number(query.year)  : undefined,
                term:                 query.term                 ? Number(query.term)  : undefined,
                title_search:         query.title_search         as string | undefined,
                instructor_search:    query.instructor_search    as string | undefined,
                online:               query.online               === 'true',
                attr_2ar:             query.attr_2ar             === 'true',
                attr_2sc:             query.attr_2sc             === 'true',
                attr_hum:             query.attr_hum             === 'true',
                attr_lsc:             query.attr_lsc             === 'true',
                attr_sci:             query.attr_sci             === 'true',
                attr_soc:             query.attr_soc             === 'true',
                attr_ut:              query.attr_ut              === 'true',
                filter_open_seats:    query.filter_open_seats    === 'true',
                filter_no_waitlist:   query.filter_no_waitlist   === 'true',
                filter_not_cancelled: query.filter_not_cancelled === 'true',
                page:                 query.page             ? Number(query.page)             : undefined,
                sections_per_page:    query.sections_per_page ? Number(query.sections_per_page) : undefined,
                sort:                 (query.sort as 'newest' | 'oldest' | 'course_asc' | 'course_desc' | undefined),
            });
        }, {
            detail: { tags: ["Search"], summary: "Advanced section search with attribute filters (paginated)" },
            query: t.Object({
                subject:              t.Optional(t.String()),
                course_code:          t.Optional(t.String()),
                year:                 t.Optional(t.String()),
                term:                 t.Optional(t.String()),
                title_search:         t.Optional(t.String()),
                instructor_search:    t.Optional(t.String()),
                online:               t.Optional(t.String()),
                attr_2ar:             t.Optional(t.String()),
                attr_2sc:             t.Optional(t.String()),
                attr_hum:             t.Optional(t.String()),
                attr_lsc:             t.Optional(t.String()),
                attr_sci:             t.Optional(t.String()),
                attr_soc:             t.Optional(t.String()),
                attr_ut:              t.Optional(t.String()),
                filter_open_seats:    t.Optional(t.String()),
                filter_no_waitlist:   t.Optional(t.String()),
                filter_not_cancelled: t.Optional(t.String()),
                page:                 t.Optional(t.String()),
                sections_per_page:    t.Optional(t.String()),
                sort:                 t.Optional(t.String()),
            }),
        })
        .get("api/v3/search/courses/simple", ({ query }) => {
            const td = query.transfers_to;
            return searchCoursesSimple(db, {
                query:              query.query              as string | undefined,
                attr_2ar:           query.attr_2ar           === 'true',
                attr_2sc:           query.attr_2sc           === 'true',
                attr_hum:           query.attr_hum           === 'true',
                attr_lsc:           query.attr_lsc           === 'true',
                attr_sci:           query.attr_sci           === 'true',
                attr_soc:           query.attr_soc           === 'true',
                attr_ut:            query.attr_ut            === 'true',
                on_langara_website: query.on_langara_website === 'true',
                transfers_to:       td ? (Array.isArray(td) ? td : [td]) : undefined,
            });
        }, {
            detail: { tags: ["Search"], summary: "Search courses — lightweight index results" },
            query: t.Object({
                query:              t.Optional(t.String()),
                attr_2ar:           t.Optional(t.String()),
                attr_2sc:           t.Optional(t.String()),
                attr_hum:           t.Optional(t.String()),
                attr_lsc:           t.Optional(t.String()),
                attr_sci:           t.Optional(t.String()),
                attr_soc:           t.Optional(t.String()),
                attr_ut:            t.Optional(t.String()),
                on_langara_website: t.Optional(t.String()),
                transfers_to:       t.Optional(t.Union([t.String(), t.Array(t.String())])),
            }),
        })
        .get("api/v3/search/courses", ({ query }) => {
            const td = query.transfer_destinations;
            return searchCourses(db, {
                query:                query.query                as string | undefined,
                title_search:         query.title_search         as string | undefined,
                subject:              query.subject              as string | undefined,
                course_code:          query.course_code          as string | undefined,
                attr_2ar:             query.attr_2ar             === 'true',
                attr_2sc:             query.attr_2sc             === 'true',
                attr_hum:             query.attr_hum             === 'true',
                attr_lsc:             query.attr_lsc             === 'true',
                attr_sci:             query.attr_sci             === 'true',
                attr_soc:             query.attr_soc             === 'true',
                attr_ut:              query.attr_ut              === 'true',
                credits:              query.credits              ? Number(query.credits) : undefined,
                on_langara_website:   query.on_langara_website   === 'true',
                offered_online:       query.offered_online       === 'true',
                prerequisites:        query.prerequisites        === 'true',
                transfer_destinations: td ? (Array.isArray(td) ? td : [td]) : undefined,
                page:                 query.page  ? Number(query.page)  : undefined,
                limit:                query.limit ? Number(query.limit) : undefined,
            });
        }, {
            detail: { tags: ["Search"], summary: "Search courses with attribute and transfer filters (paginated)" },
            query: t.Object({
                query:                 t.Optional(t.String()),
                title_search:          t.Optional(t.String()),
                subject:               t.Optional(t.String()),
                course_code:           t.Optional(t.String()),
                attr_2ar:              t.Optional(t.String()),
                attr_2sc:              t.Optional(t.String()),
                attr_hum:              t.Optional(t.String()),
                attr_lsc:              t.Optional(t.String()),
                attr_sci:              t.Optional(t.String()),
                attr_soc:              t.Optional(t.String()),
                attr_ut:               t.Optional(t.String()),
                credits:               t.Optional(t.String()),
                on_langara_website:    t.Optional(t.String()),
                offered_online:        t.Optional(t.String()),
                prerequisites:         t.Optional(t.String()),
                transfer_destinations: t.Optional(t.Union([t.String(), t.Array(t.String())])),
                page:                  t.Optional(t.String()),
                limit:                 t.Optional(t.String()),
            }),
        })
        // ── Transfers ─────────────────────────────────────────────────────────
        .get("api/v3/courses/:subject/:code/transfers", ({ params }) => {
            return getCourseTransfers(db, params.subject, params.code);
        }, {
            detail: { tags: ["Transfers"], summary: "Transfer agreements for a course" },
        })
        .get("api/v3/transfers/:institution", ({ params }) => {
            return getTransfersByInstitution(db, params.institution);
        }, {
            detail: { tags: ["Transfers"], summary: "All transfers to an institution" },
        })
        .get("api/v3/index/transfer_destinations", () => getTransferDestinations(db), {
            detail: { tags: ["Transfers"], summary: "All transfer destinations" },
            response: t.Object({
                count: t.Number(),
                transfers: t.Array(t.Object({
                    code: t.String(),
                    name: t.String(),
                })),
            })
        });
}
