import { Database } from "bun:sqlite";
import { Elysia } from "elysia";
import { renderHome } from "./pages/home.ts";
import { renderSourcesList } from "./pages/sources.ts";
import { renderSourceDetail } from "./pages/sourceDetail.ts";
import { renderSourceContent } from "./pages/sourceContent.ts";
import { renderAllRecordsPage, renderRecordsPage } from "./pages/records.ts";
import { renderStatusPage } from "./pages/status.ts";

// Helper to get data from API handlers directly
async function getApiData(path: string, api: Elysia<any>): Promise<any> {
    const response = await api.handle(new Request(`http://localhost${path}`));
    if (!response || response.status >= 400) return null;
    return response.json();
}

export async function handleFrontend(req: Request, db: Database, privateApi: any): Promise<Response> {
    const url = new URL(req.url);
    const pathname = url.pathname;

    if (pathname === '/' || pathname === '/home') {
        const stats = await getApiData('/privapi/stats', privateApi);
        return new Response(renderHome(stats || { totalSources: 0, activeSources: 0, dueSources: 0, totalFetched: 0, totalParsed: 0 }), {
            headers: { 'Content-Type': 'text/html' }
        });
    }

    if (pathname === '/sources') {
        const sources = await getApiData('/privapi/sources', privateApi);
        return new Response(renderSourcesList(sources || []), {
            headers: { 'Content-Type': 'text/html' }
        });
    }

    if (pathname.match(/^\/sources\/\d+$/)) {
        const sourceId = parseInt(pathname.split('/')[2]);
        const data = await getApiData(`/privapi/sources/${sourceId}`, privateApi);
        return new Response(renderSourceDetail(data), {
            headers: { 'Content-Type': 'text/html' }
        });
    }

    if (pathname.match(/^\/sources\/\d+\/fetches\/\d+$/)) {
        const parts = pathname.split('/');
        const sourceId = parseInt(parts[2]);
        const fetchId = parseInt(parts[4]);
        const data = await getApiData(`/privapi/records/${fetchId}`, privateApi);
        return new Response(renderSourceContent(data?.content || null, sourceId), {
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
    }

    if (pathname === '/records' || pathname === '/records/') {
        const pageParam = parseInt(url.searchParams.get('page') || '1', 10);
        const page = isNaN(pageParam) || pageParam < 1 ? 1 : pageParam;
        const paged = await getApiData(`/privapi/records?page=${page}`, privateApi);
        return new Response(renderAllRecordsPage(paged || { total: 0, page: 1, pageSize: 25, rows: [] }), {
            headers: { 'Content-Type': 'text/html' }
        });
    }

    if (pathname.match(/^\/records\/\d+$/)) {
        const recordId = parseInt(pathname.split('/')[2]);
        const data = await getApiData(`/privapi/records/${recordId}`, privateApi);
        return new Response(renderRecordsPage(data || { record: null }), {
            headers: { 'Content-Type': 'text/html' }
        });
    }

    if (pathname === '/status') {
        const stats = await getApiData('/privapi/stats', privateApi);
        const sources = await getApiData('/privapi/sources', privateApi);
        const recentFetches = await getApiData('/privapi/recent-fetches', privateApi);
        
        return new Response(renderStatusPage(
            stats || { totalSources: 0, activeSources: 0, dueSources: 0, totalFetched: 0, totalParsed: 0 },
            sources || [],
            recentFetches || []
        ), {
            headers: { 'Content-Type': 'text/html' }
        });
    }

    return new Response('Not Found', { status: 404 });
}
