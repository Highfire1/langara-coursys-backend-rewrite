import { Database } from "bun:sqlite";
import { createPublicApi } from "./3/publicApi.ts";
import { createPrivateApi } from "./3/privateApi.ts";
import { handleFrontend } from "./4/index.ts";
import path from "path";

const db = new Database("./data/database.sqlite");
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
