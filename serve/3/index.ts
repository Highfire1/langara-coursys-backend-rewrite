import { Database } from "bun:sqlite";
import { handleV3 } from "./publicApi.ts";
import { handlePrivate } from "./privateApi.ts";

const db = new Database("./../data/database.sqlite");
const PORT = 3000;

Bun.serve({
    port: PORT,
    fetch(req) {
        const url = new URL(req.url);

        const v3 = handleV3(url, db);
        if (v3) return v3;

        const privateResp = handlePrivate(url, db);
        if (privateResp) return privateResp;

        return new Response(JSON.stringify({ error: 'Not Found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
        });
    },
});

console.log(`Service 3 API running on http://localhost:${PORT}`);
