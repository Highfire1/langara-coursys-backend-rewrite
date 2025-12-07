import { Elysia, t } from "elysia";
import { openapi, fromTypes } from "@elysiajs/openapi";
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

function getAllSubjects(db: Database) {
    const rows = db
        .query(`SELECT DISTINCT subject FROM Section ORDER BY subject ASC`)
        .all() as Array<{ subject: string }>;
    return {
        count: rows.length,
        subjects: rows.map(r => r.subject),
    };
}

async function getAllCourses() {
    const resp = await fetch("https://api.langaracourses.ca/v1/index/courses");
    return await resp.json();
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

export function createPublicApi(db: Database) {
    return new Elysia( { strictPath: true } )
        .use(openapi({
            path: "/api",
            documentation: {
                info: {
                    title: "Langara Course Data Public API",
                    version: "3.0.0",
                    description: "Public read-only API for course and transfer data",
                },
            },
            // references: fromTypes({ path: './types.ts' }),
        }))
        .get("api/health", () => ({
            status: "healthy",
            timestamp: new Date().toISOString(),
            database: "connected",
            version: "3.0.0",
        }), {
            response: t.Object({
                status: t.String(),
                timestamp: t.String(),
                database: t.String(),
                version: t.String(),
            })
        })
        .get("api/v3/index/latest_semester", () => getLatestSemester(db), {
            response: t.Object({
                term: t.Number(),
                year: t.Number(),
            })
        })
        .get("api/v3/index/semesters", () => getAllSemesters(db), {
            response: t.Object({
                count: t.Number(),
                semesters: t.Array(t.Object({
                    term: t.Number(),
                    year: t.Number(),
                })),
            })
        })
        .get("api/v3/index/subjects", () => getAllSubjects(db), {
            response: t.Object({
                count: t.Number(),
                subjects: t.Array(t.String()),
            })
        })
        .get("api/v3/index/courses", () => getAllCourses(), {
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
        .get("api/v3/index/transfer_destinations", () => getTransferDestinations(db), {
            response: t.Object({
                count: t.Number(),
                transfers: t.Array(t.Object({
                    code: t.String(),
                    name: t.String(),
                })),
            })
        });
}
