import { Database } from "bun:sqlite";
import { handleV3 } from "./publicApi.ts";
import { handlePrivate } from "./privateApi.ts";

const db = new Database("./../data/database.sqlite");
const PORT = 3000;

Bun.serve({
    port: PORT,
    fetch(req) {
        const url = new URL(req.url);

        if (url.pathname === '/api') {
            const html = 
`<!doctype html>
<html>
  <head>
    <title>Scalar API Reference</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>
    <div id="app"></div>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
    <script>
      Scalar.createApiReference('#app', {
        url: '/v3/openapi.json',
        proxyUrl: 'https://proxy.scalar.com'
      });
    </script>
  </body>
</html>`;
            return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        }

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
