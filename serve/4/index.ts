import { renderHome } from "./pages/home.ts";
import { renderSourcesList } from "./pages/sources.ts";
import { renderSourceDetail } from "./pages/sourceDetail.ts";
import { renderSourceContent } from "./pages/sourceContent.ts";
import { renderAllRecordsPage, renderRecordsPage } from "./pages/records.ts";
import { renderStatusPage } from "./pages/status.ts";

const API_BASE = process.env.API_BASE || "http://localhost:3000";
const PORT = 3001;

async function fetchJson<T>(path: string): Promise<T | null> {
    try {
        const res = await fetch(`${API_BASE}${path}`);
        if (!res.ok) return null;
        return await res.json() as T;
    } catch (err) {
        console.error(`Failed to fetch ${path}`, err);
        return null;
    }
}

Bun.serve({
    port: PORT,
    async fetch(req) {
        const url = new URL(req.url);
        const pathname = url.pathname;

        if (pathname === '/' || pathname === '/home') {
            const stats = await fetchJson<any>('/api/stats');
            return new Response(renderHome(stats || { totalSources: 0, activeSources: 0, dueSources: 0, totalFetched: 0, totalParsed: 0 }), {
                headers: { 'Content-Type': 'text/html' }
            });
        }

        if (pathname === '/sources') {
            const sources = await fetchJson<any[]>('/api/sources');
            return new Response(renderSourcesList(sources || []), {
                headers: { 'Content-Type': 'text/html' }
            });
        }

        if (pathname.match(/^\/sources\/\d+$/)) {
            const sourceId = parseInt(pathname.split('/')[2]);
            const data = await fetchJson<any>(`/api/sources/${sourceId}`);
            return new Response(renderSourceDetail(data), {
                headers: { 'Content-Type': 'text/html' }
            });
        }

        if (pathname.match(/^\/sources\/\d+\/fetches\/\d+$/)) {
            const parts = pathname.split('/');
            const sourceId = parseInt(parts[2]);
            const fetchId = parseInt(parts[4]);
            const data = await fetchJson<any>(`/api/records/${fetchId}`);
            return new Response(renderSourceContent(data?.content || null, sourceId), {
                headers: { 'Content-Type': 'text/html; charset=utf-8' }
            });
        }

        if (pathname === '/records' || pathname === '/records/') {
            const pageParam = parseInt(url.searchParams.get('page') || '1', 10);
            const page = isNaN(pageParam) || pageParam < 1 ? 1 : pageParam;
            const paged = await fetchJson<any>(`/api/records?page=${page}`);
            return new Response(renderAllRecordsPage(paged || { total: 0, page: 1, pageSize: 25, rows: [] }), {
                headers: { 'Content-Type': 'text/html' }
            });
        }

        if (pathname.match(/^\/records\/\d+$/)) {
            const recordId = parseInt(pathname.split('/')[2]);
            const data = await fetchJson<any>(`/api/records/${recordId}`);
            return new Response(renderRecordsPage(data || { record: null }), {
                headers: { 'Content-Type': 'text/html' }
            });
        }

        if (pathname === '/status') {
            const [stats, sources, recentFetches] = await Promise.all([
                fetchJson<any>('/api/stats'),
                fetchJson<any[]>('/api/sources'),
                fetchJson<any[]>('/api/recent-fetches')
            ]);
            return new Response(renderStatusPage(stats || { totalSources: 0, activeSources: 0, dueSources: 0, totalFetched: 0, totalParsed: 0 }, sources || [], recentFetches || []), {
                headers: { 'Content-Type': 'text/html' }
            });
        }

        return new Response('Not Found', { status: 404 });
    }
});

console.log(`Frontend running on http://localhost:${PORT} (API: ${API_BASE})`);
