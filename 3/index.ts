import { Database } from "bun:sqlite";
import { readFileSync } from "fs";
import { Source, SourceFetched } from "../types.ts";

const db = new Database("./database.sqlite");
const PORT = 3000;

function formatRelativeFuture(date: Date): string {
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    if (diffMs < 0) return "due now";
    
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) return `in ${diffSecs}s`;
    if (diffMins < 60) return `in ${diffMins}m`;
    if (diffHours < 24) return `in ${diffHours}h`;
    if (diffDays < 7) return `in ${diffDays}d`;
    return date.toLocaleDateString();
}

// Get statistics for dashboard
function getStats() {
    const sources = db.query("SELECT COUNT(*) as count FROM Source").get() as any;
    const active = db.query("SELECT COUNT(*) as count FROM Source WHERE isActive = 1").get() as any;
    const due = db.query("SELECT COUNT(*) as count FROM Source WHERE nextFetch <= datetime('now')").get() as any;
    const fetched = db.query("SELECT COUNT(*) as count FROM SourceFetched").get() as any;
    const parsed = db.query("SELECT COUNT(*) as count FROM SourceFetched WHERE parsed = 1").get() as any;

    return {
        totalSources: sources.count || 0,
        activeSources: active.count || 0,
        dueSources: due.count || 0,
        totalFetched: fetched.count || 0,
        totalParsed: parsed.count || 0,
    };
}

// Get all sources with status
function getAllSources(): (Source & { status: string; nextFetchIn: string })[] {
    const rows = db.query(`
        SELECT 
            s.*,
            COUNT(sf.id) as fetchCount,
            SUM(CASE WHEN sf.parsed = 1 THEN 1 ELSE 0 END) as parseCount
        FROM Source s
        LEFT JOIN SourceFetched sf ON s.id = sf.sourceId
        GROUP BY s.id
    `).all() as any[];

    return rows.map(row => {
        const nextFetch = new Date(row.nextFetch);
        let status = 'OK';
        if (!row.isActive) status = 'Inactive';
        else if (nextFetch <= new Date()) status = 'Due';

        return {
            id: row.id,
            sourceType: row.sourceType,
            sourceIdentifier: row.sourceIdentifier,
            fetchFrequency: row.fetchFrequency,
            nextFetch: nextFetch,
            lastFetched: row.lastFetched ? new Date(row.lastFetched) : null,
            lastSaved: row.lastSaved ? new Date(row.lastSaved) : null,
            lastSavedContentHash: row.lastSavedContentHash,
            savedCount: row.savedCount,
            isActive: row.isActive === 1,
            status,
            nextFetchIn: formatRelativeFuture(nextFetch),
        };
    });
}

// Get recent fetches
function getRecentFetches(limit: number = 20) {
    const rows = db.query(`
        SELECT sf.*, s.sourceType, s.sourceIdentifier
        FROM SourceFetched sf
        JOIN Source s ON sf.sourceId = s.id
        ORDER BY sf.fetchedAt DESC
        LIMIT ?
    `).all(limit) as any[];

    return rows.map(row => ({
        id: row.id,
        sourceId: row.sourceId,
        sourceType: row.sourceType,
        sourceIdentifier: row.sourceIdentifier,
        fetchedAt: new Date(row.fetchedAt),
        parsed: row.parsed === 1,
    }));
}

// Get a single source with recent fetches
function getSourceWithFetches(sourceId: number) {
    const source = db.query("SELECT * FROM Source WHERE id = ?").get(sourceId) as any;
    if (!source) return null;

    const fetches = db.query(`
        SELECT * FROM SourceFetched 
        WHERE sourceId = ? 
        ORDER BY fetchedAt DESC 
        LIMIT 10
    `).all(sourceId) as any[];

    const nextFetch = new Date(source.nextFetch);
    let status = 'OK';
    if (!source.isActive) status = 'Inactive';
    else if (nextFetch <= new Date()) status = 'Due';

    // Get the latest fetched content
    let latestContent: string | null = null;
    let latestContentId: number | null = null;
    if (fetches.length > 0) {
        const latest = fetches[0];
        latestContentId = latest.id;
        if (latest.contentLink.startsWith("file://")) {
            const filepath = latest.contentLink.slice(7);
            try {
                latestContent = readFileSync(filepath, 'utf-8');
            } catch {
                latestContent = null;
            }
        }
    }

    return {
        id: source.id,
        sourceType: source.sourceType,
        sourceIdentifier: source.sourceIdentifier,
        fetchFrequency: source.fetchFrequency,
        nextFetch: nextFetch,
        lastFetched: source.lastFetched ? new Date(source.lastFetched) : null,
        lastSaved: source.lastSaved ? new Date(source.lastSaved) : null,
        lastSavedContentHash: source.lastSavedContentHash,
        savedCount: source.savedCount,
        isActive: source.isActive === 1,
        status,
        nextFetchIn: formatRelativeFuture(nextFetch),
        latestContent,
        latestContentId,
        recentFetches: fetches.map((f: any) => ({
            id: f.id,
            fetchedAt: new Date(f.fetchedAt),
            parsed: f.parsed === 1,
            contentHash: f.contentHash,
            contentType: f.contentType,
        })),
    };
}


// Fetch paginated SourceFetched rows
function getFetchedPage(page: number, pageSize: number) {
    const totalRow = db.query("SELECT COUNT(*) as count FROM SourceFetched").get() as any;
    const total = totalRow?.count || 0;
    const offset = (page - 1) * pageSize;
    const rows = db.query(`
        SELECT sf.*, s.sourceType, s.sourceIdentifier
        FROM SourceFetched sf
        JOIN Source s ON sf.sourceId = s.id
        ORDER BY sf.id DESC
        LIMIT ? OFFSET ?
    `).all(pageSize, offset) as any[];
    return { total, page, pageSize, rows };
}

// API routes
function handleAPI(url: URL): Response | null {
    const pathname = url.pathname;
    const headers = { 'Content-Type': 'application/json' };

    if (pathname === '/api/health') {
        return new Response(JSON.stringify({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            database: 'connected',
            version: '1.0.0'
        }), { headers });
    }

    if (pathname === '/api/stats') {
        return new Response(JSON.stringify(getStats()), { headers });
    }

    if (pathname === '/api/sources') {
        return new Response(JSON.stringify(getAllSources()), { headers });
    }

    if (pathname.match(/^\/api\/sources\/(\d+)$/)) {
        const sourceId = parseInt(pathname.split('/')[3]);
        const data = getSourceWithFetches(sourceId);
        if (!data) {
            return new Response(JSON.stringify({ error: 'Source not found' }), { status: 404, headers });
        }
        return new Response(JSON.stringify(data), { headers });
    }

    if (pathname === '/api/recent-fetches') {
        const limitParam = parseInt(url.searchParams.get('limit') || '20', 10);
        const limit = isNaN(limitParam) || limitParam < 1 ? 20 : limitParam;
        return new Response(JSON.stringify(getRecentFetches(limit)), { headers });
    }

    if (pathname === '/api/records') {
        const pageParam = parseInt(url.searchParams.get('page') || '1', 10);
        const pageSizeParam = parseInt(url.searchParams.get('pageSize') || '25', 10);
        const page = isNaN(pageParam) || pageParam < 1 ? 1 : pageParam;
        const pageSize = isNaN(pageSizeParam) || pageSizeParam < 1 ? 25 : Math.min(pageSizeParam, 200);

        const parsedRow = db.query("SELECT COUNT(*) as count FROM SourceFetched WHERE parsed = 1").get() as any;
        const unparsedRow = db.query("SELECT COUNT(*) as count FROM SourceFetched WHERE parsed = 0").get() as any;
        const paged = getFetchedPage(page, pageSize);
        const payload = {
            ...paged,
            parsedTotal: parsedRow?.count || 0,
            unparsedTotal: unparsedRow?.count || 0,
        };
        return new Response(JSON.stringify(payload), { headers });
    }

    if (pathname.match(/^\/api\/records\/(\d+)$/)) {
        const recordId = parseInt(pathname.split('/')[3]);
        const record = db.query("SELECT * FROM SourceFetched WHERE id = ?").get(recordId) as any;
        if (!record) {
            return new Response(JSON.stringify({ error: 'Record not found' }), { status: 404, headers });
        }

        const source = db.query("SELECT * FROM Source WHERE id = ?").get(record.sourceId) as any;
        let content: string | null = null;
        if (record.contentLink?.startsWith("file://")) {
            const filepath = record.contentLink.slice(7);
            try {
                content = readFileSync(filepath, 'utf-8');
            } catch {
                content = null;
            }
        }

        return new Response(JSON.stringify({ record, source, content }), { headers });
    }

    return null;
}

// Server
Bun.serve({
    port: PORT,
    fetch(req) {
        const url = new URL(req.url);

        const apiResponse = handleAPI(url);
        if (apiResponse) return apiResponse;

        return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    },
});

console.log(`Service 3 API running on http://localhost:${PORT}`);
