import { Database } from "bun:sqlite";
import { Elysia } from "elysia";
import { createPublicApi } from "./publicApi.ts";
import { createPrivateApi } from "./privateApi.ts";

const db = new Database("./../data/database.sqlite");
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
