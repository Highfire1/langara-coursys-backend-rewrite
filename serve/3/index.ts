import { Database } from "bun:sqlite";
import { Elysia } from "elysia";
import { createPublicApi } from "./publicApi.ts";
import { createPrivateApi } from "./privateApi.ts";

const db = new Database("./../data/database.sqlite");

// Create indexes in background to avoid blocking startup
setTimeout(() => {
    try {
        db.run(`CREATE INDEX IF NOT EXISTS idx_section_course_online ON Section(subject, courseCode, section, year, term)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_section_course_semester ON Section(subject, courseCode, year, term)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_transfer_course ON Transfer(subject, courseNumber)`);
        console.log("Indexes ready");
    } catch (e) {
        console.error("Failed to create indexes:", e);
    }
}, 0);

const PORT = 3000;

const app = new Elysia()
    .use(createPublicApi(db))
    .use(createPrivateApi(db))
    .all("*", () => new Response(JSON.stringify({ error: 'Not Found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
    }));

Bun.serve({
    port: PORT,
    fetch: app.handle,
});

console.log(`Service 3 API running on http://localhost:${PORT}`);
