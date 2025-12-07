import { Database } from "bun:sqlite";
import { handleV3 as handlePublic } from "./3/publicApi.ts";
import { handlePrivate } from "./3/privateApi.ts";
import { handleFrontend } from "./4/index.ts";

const db = new Database("./data/database.sqlite");
const PORT = 3000;

Bun.serve({
    port: PORT,
    async fetch(req) {
        const url = new URL(req.url);
        const pathname = url.pathname;

        // Public API routes - /api/v3/**
        if (pathname.startsWith('/api/v3/')) {
            const publicResp = handlePublic(url, db);
            if (publicResp) return publicResp;

            return new Response(JSON.stringify({ error: 'Not Found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // Private API routes - /privapi/**
        if (pathname.startsWith('/privapi/')) {
            const privateResp = handlePrivate(url, db);
            if (privateResp) return privateResp;

            return new Response(JSON.stringify({ error: 'Not Found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // Scalar API Reference UI
        if (pathname === '/api') {
            return new Response(`<!doctype html>
<html>
  <head>
    <title>Scalar API Reference</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body {
        margin: 0;
        padding: 0;
        background: #0d1117;
        color: #c9d1d9;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      #app {
        min-height: 100vh;
      }
    </style>
  </head>
  <body>
    <div id="app"></div>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
    <script>
      Scalar.createApiReference('#app', {
        url: '/api/v3/openapi.json',
        theme: 'dark',
        layout: 'modern',
      })
    </script>
  </body>
</html>`, {
                headers: { 'Content-Type': 'text/html' }
            });
        }

        // Frontend routes - everything else
        return await handleFrontend(req, db);
    },
});

console.log(`Server running on http://localhost:${PORT}`);
