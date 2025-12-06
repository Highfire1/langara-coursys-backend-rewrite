import { Database } from "bun:sqlite";
import { readFileSync } from "fs";
import { Source, SourceFetched } from "../types.ts";

const db = new Database("./database.sqlite");
const PORT = 3000;

// Helper to format relative time
function formatRelativeTime(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) return `${diffSecs}s ago`;
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
}

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

// Get content from a SourceFetched record
function getSourceContent(sourceFetchedId: number): string | null {
    const record = db.query("SELECT contentLink FROM SourceFetched WHERE id = ?").get(sourceFetchedId) as any;
    if (!record) return null;

    if (record.contentLink.startsWith("file://")) {
        const filepath = record.contentLink.slice(7);
        try {
            return readFileSync(filepath, 'utf-8');
        } catch {
            return null;
        }
    }
    return null;
}

// HTML for homepage
function renderHome(stats: ReturnType<typeof getStats>): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Langara Course Data System</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #0d1117;
            color: #c9d1d9;
            padding: 20px;
        }
        .container { max-width: 1200px; margin: 0 auto; }
        header { margin-bottom: 40px; }
        h1 { font-size: 32px; margin-bottom: 8px; color: #58a6ff; }
        .subtitle { font-size: 16px; color: #8b949e; margin-bottom: 20px; }
        
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 16px;
            margin-bottom: 40px;
        }
        .stat-card {
            background: #161b22;
            border: 1px solid #30363d;
            border-radius: 8px;
            padding: 20px;
            text-align: center;
        }
        .stat-value {
            font-size: 32px;
            font-weight: bold;
            color: #58a6ff;
            margin: 10px 0;
        }
        .stat-label {
            font-size: 14px;
            color: #8b949e;
        }
        
        .links {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 16px;
            margin-bottom: 40px;
        }
        .link-card {
            background: #161b22;
            border: 1px solid #30363d;
            border-radius: 8px;
            padding: 20px;
            text-decoration: none;
            color: inherit;
            transition: all 0.2s;
        }
        .link-card:hover {
            border-color: #58a6ff;
            background: #0d1117;
        }
        .link-card h3 {
            color: #58a6ff;
            margin-bottom: 8px;
            font-size: 18px;
        }
        .link-card p {
            font-size: 14px;
            color: #8b949e;
            line-height: 1.5;
        }
        
        footer {
            text-align: center;
            padding-top: 40px;
            border-top: 1px solid #30363d;
            color: #8b949e;
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>📊 Langara Course Data System</h1>
            <p class="subtitle">Real-time course and transfer data aggregation</p>
        </header>

        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-label">Total Sources</div>
                <div class="stat-value">${stats.totalSources}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Active Sources</div>
                <div class="stat-value">${stats.activeSources}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Due for Fetch</div>
                <div class="stat-value">${stats.dueSources}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Total Fetched</div>
                <div class="stat-value">${stats.totalFetched}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Total Parsed</div>
                <div class="stat-value">${stats.totalParsed}</div>
            </div>
        </div>

        <div class="links">
            <a href="/status" class="link-card">
                <h3>📈 Full Status</h3>
                <p>Detailed view of all sources, their fetch history, and parsed records with real-time updates.</p>
            </a>
            <a href="/sources" class="link-card">
                <h3>📚 Sources List</h3>
                <p>Browse all data sources and view their individual status, configuration, and recent fetches.</p>
            </a>
            <a href="/api" class="link-card">
                <h3>🔌 API Documentation</h3>
                <p>View available API endpoints, query course data, and integrate with external systems.</p>
            </a>
        </div>

        <footer>
            <p>Langara Course Data System v1.0 • Built with Bun + SQLite</p>
        </footer>
    </div>
</body>
</html>`;
}

// HTML for sources list
function renderSourcesList(sources: ReturnType<typeof getAllSources>): string {
    const sourcesByType = sources.reduce((acc, src) => {
        if (!acc[src.sourceType]) acc[src.sourceType] = [];
        acc[src.sourceType].push(src);
        return acc;
    }, {} as Record<string, any[]>);

    let sourcesHtml = '';
    for (const [type, srcs] of Object.entries(sourcesByType)) {
        sourcesHtml += `
        <div class="source-group">
            <h3>${type}</h3>
            <div class="source-table">
                ${srcs.map(src => `
                <a href="/sources/${src.id}" class="source-row">
                    <div class="source-id">${src.id}</div>
                    <div class="source-identifier">${src.sourceIdentifier || '—'}</div>
                    <div class="source-status ${src.status.toLowerCase()}">${src.status}</div>
                    <div class="source-fetch">${src.nextFetchIn}</div>
                </a>
                `).join('')}
            </div>
        </div>`;
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sources - Langara Course Data</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #0d1117;
            color: #c9d1d9;
            padding: 20px;
        }
        .container { max-width: 1200px; margin: 0 auto; }
        header { margin-bottom: 30px; }
        h1 { font-size: 28px; margin-bottom: 8px; color: #58a6ff; }
        .back-link { color: #58a6ff; text-decoration: none; margin-bottom: 20px; display: inline-block; }
        .back-link:hover { text-decoration: underline; }
        
        .source-group { margin-bottom: 40px; }
        .source-group h3 { 
            font-size: 18px;
            color: #79c0ff;
            margin-bottom: 12px;
            padding-bottom: 8px;
            border-bottom: 1px solid #30363d;
        }
        .source-table { display: flex; flex-direction: column; gap: 8px; }
        .source-row {
            display: grid;
            grid-template-columns: 50px 1fr 100px 120px;
            gap: 16px;
            align-items: center;
            padding: 12px;
            background: #161b22;
            border: 1px solid #30363d;
            border-radius: 6px;
            text-decoration: none;
            color: inherit;
            transition: all 0.2s;
        }
        .source-row:hover {
            border-color: #58a6ff;
            background: #0d1117;
        }
        .source-id {
            font-weight: bold;
            color: #58a6ff;
            font-size: 14px;
        }
        .source-identifier {
            font-size: 14px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .source-status {
            font-size: 12px;
            padding: 4px 8px;
            border-radius: 4px;
            text-align: center;
            font-weight: 500;
        }
        .source-status.ok {
            background: #238636;
            color: #aaffc9;
        }
        .source-status.due {
            background: #da3633;
            color: #ffb3b0;
        }
        .source-status.inactive {
            background: #6e40aa;
            color: #d8b9ff;
        }
        .source-fetch {
            font-size: 13px;
            color: #8b949e;
            text-align: right;
        }
    </style>
</head>
<body>
    <div class="container">
        <a href="/" class="back-link">← Home</a>
        <header>
            <h1>📚 Data Sources</h1>
        </header>

        ${sourcesHtml}
    </div>
</body>
</html>`;
}

// HTML for individual source view - displays the latest fetched content
function renderSourceDetail(sourceId: number): string {
    const data = getSourceWithFetches(sourceId);
    if (!data) {
        return `<!DOCTYPE html>
<html><head><title>Source Not Found</title></head>
<body><h1>Source not found</h1></body></html>`;
    }

    const fetchesHtml = data.recentFetches.map((f: any, i: number) => `
        <div class="fetch-item ${f.id === data.latestContentId ? 'latest' : ''}">
            <div class="fetch-time">${f.fetchedAt.toLocaleString()}</div>
            <div class="fetch-status ${f.parsed ? 'parsed' : 'unparsed'}">${f.parsed ? 'Parsed' : 'Unparsed'}</div>
            <div class="fetch-hash" title="${f.contentHash}">${f.contentHash.substring(0, 8)}...</div>
            ${f.id === data.latestContentId ? '<span class="latest-badge">Latest</span>' : '<a href="/sources/${sourceId}/fetches/${f.id}" class="fetch-link">View</a>'}
        </div>
    `).join('');

    // Escape content for use in iframe srcdoc
    const escapedContent = data.latestContent ? 
        data.latestContent.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${data.sourceType} - ${data.sourceIdentifier}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #0d1117;
            color: #c9d1d9;
            padding: 20px;
        }
        .container { max-width: 1400px; margin: 0 auto; }
        .back-link { color: #58a6ff; text-decoration: none; margin-bottom: 20px; display: inline-block; }
        .back-link:hover { text-decoration: underline; }
        
        header { margin-bottom: 30px; }
        h1 { font-size: 28px; color: #58a6ff; margin-bottom: 8px; }
        
        .info-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 16px;
            margin-bottom: 30px;
        }
        .info-card {
            background: #161b22;
            border: 1px solid #30363d;
            border-radius: 8px;
            padding: 16px;
        }
        .info-label {
            font-size: 12px;
            color: #8b949e;
            text-transform: uppercase;
            margin-bottom: 8px;
        }
        .info-value {
            font-size: 16px;
            color: #58a6ff;
            word-break: break-all;
        }
        
        .content-section {
            background: #161b22;
            border: 1px solid #30363d;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 30px;
        }
        .content-section h2 {
            font-size: 20px;
            color: #79c0ff;
            margin-bottom: 16px;
        }
        .content-iframe {
            width: 100%;
            height: 600px;
            border: 1px solid #30363d;
            border-radius: 6px;
            background: white;
        }
        
        .fetches-section { margin-top: 30px; }
        .fetches-section h2 { font-size: 20px; color: #79c0ff; margin-bottom: 16px; }
        .fetch-item {
            display: grid;
            grid-template-columns: 200px 100px 150px auto;
            gap: 16px;
            align-items: center;
            padding: 12px;
            background: #161b22;
            border: 1px solid #30363d;
            border-radius: 6px;
            margin-bottom: 8px;
        }
        .fetch-item.latest {
            border-color: #58a6ff;
            background: #0d1117;
        }
        .fetch-time { font-size: 14px; }
        .fetch-status {
            font-size: 12px;
            padding: 4px 8px;
            border-radius: 4px;
            text-align: center;
            font-weight: 500;
        }
        .fetch-status.parsed {
            background: #238636;
            color: #aaffc9;
        }
        .fetch-status.unparsed {
            background: #da3633;
            color: #ffb3b0;
        }
        .fetch-hash {
            font-family: monospace;
            font-size: 12px;
            color: #8b949e;
        }
        .fetch-link {
            color: #58a6ff;
            text-decoration: none;
            font-size: 12px;
        }
        .fetch-link:hover { text-decoration: underline; }
        .latest-badge {
            display: inline-block;
            background: #238636;
            color: #aaffc9;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 600;
        }
    </style>
</head>
<body>
    <div class="container">
        <a href="/sources" class="back-link">← Back to Sources</a>
        
        <header>
            <h1>${data.sourceType}</h1>
            <p style="color: #8b949e;">${data.sourceIdentifier}</p>
            <div style="margin-top: 12px; display: flex; gap: 16px;">
                <a href="/sources/${data.id}" style="color: #58a6ff; text-decoration: none; font-size: 14px;">📄 View Content</a>
                <a href="/records/${data.id}" style="color: #58a6ff; text-decoration: none; font-size: 14px;">📋 View Records</a>
            </div>
        </header>

        <div class="info-grid">
            <div class="info-card">
                <div class="info-label">Status</div>
                <div class="info-value">${data.status}</div>
            </div>
            <div class="info-card">
                <div class="info-label">Active</div>
                <div class="info-value">${data.isActive ? '✓ Yes' : '✗ No'}</div>
            </div>
            <div class="info-card">
                <div class="info-label">Fetch Frequency</div>
                <div class="info-value">${data.fetchFrequency} hours</div>
            </div>
            <div class="info-card">
                <div class="info-label">Total Fetched</div>
                <div class="info-value">${data.savedCount}</div>
            </div>
            <div class="info-card">
                <div class="info-label">Last Fetched</div>
                <div class="info-value">${data.lastFetched ? data.lastFetched.toLocaleString() : 'Never'}</div>
            </div>
            <div class="info-card">
                <div class="info-label">Next Fetch</div>
                <div class="info-value">${data.nextFetchIn}</div>
            </div>
        </div>

        <div class="content-section">
            <h2>Latest Fetched Content</h2>
            ${data.latestContent ? `<iframe class="content-iframe" sandbox="allow-same-origin"></iframe>
            <script>
                const frame = document.querySelector('.content-iframe');
                frame.srcdoc = \`${escapedContent}\`;
            </script>` : '<p style="color: #8b949e;">No content available</p>'}
        </div>

        <div class="fetches-section">
            <h2>Fetch History</h2>
            ${fetchesHtml || '<p style="color: #8b949e;">No fetches yet</p>'}
        </div>
    </div>
</body>
</html>`;
}

// HTML for viewing fetched content
function renderSourceContent(sourceId: number, sourceFetchedId: number): string {
    const content = getSourceContent(sourceFetchedId);
    if (!content) {
        return `<!DOCTYPE html>
<html><head><title>Content Not Found</title></head>
<body><h1>Content not found or unable to load</h1></body></html>`;
    }

    const isHtml = content.trim().startsWith('<');
    
    if (isHtml) {
        return content;
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Fetched Content</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #0d1117;
            color: #c9d1d9;
            padding: 20px;
        }
        .container { max-width: 1200px; margin: 0 auto; }
        .back-link { color: #58a6ff; text-decoration: none; margin-bottom: 20px; display: inline-block; }
        pre {
            background: #161b22;
            border: 1px solid #30363d;
            border-radius: 6px;
            padding: 16px;
            overflow-x: auto;
            font-size: 12px;
            line-height: 1.5;
        }
    </style>
</head>
<body>
    <div class="container">
        <a href="/sources/${sourceId}" class="back-link">← Back to Source</a>
        <h2>Fetched Content (JSON)</h2>
        <pre>${content}</pre>
    </div>
</body>
</html>`;
}

// Get records by sourceId - returns records from all 5 parsed tables
function getRecordsBySourceId(sourceId: number) {
    const transfers = db.query("SELECT 'Transfer' as type, * FROM Transfer WHERE sourceId = ?").all(sourceId) as any[];
    const courseAttributes = db.query("SELECT 'CourseAttribute' as type, * FROM CourseAttribute WHERE sourceId = ?").all(sourceId) as any[];
    const courseSummaries = db.query("SELECT 'CourseSummary' as type, * FROM CourseSummary WHERE sourceId = ?").all(sourceId) as any[];
    const sections = db.query("SELECT 'Section' as type, * FROM Section WHERE sourceId = ?").all(sourceId) as any[];
    const scheduleEntries = db.query("SELECT 'ScheduleEntry' as type, * FROM ScheduleEntry WHERE sourceId = ?").all(sourceId) as any[];

    return {
        sourceId,
        transfers: transfers.length,
        courseAttributes: courseAttributes.length,
        courseSummaries: courseSummaries.length,
        sections: sections.length,
        scheduleEntries: scheduleEntries.length,
        total: transfers.length + courseAttributes.length + courseSummaries.length + sections.length + scheduleEntries.length,
        records: [
            ...transfers,
            ...courseAttributes,
            ...courseSummaries,
            ...sections,
            ...scheduleEntries,
        ]
    };
}

// HTML for all records page (lists SourceFetched records)
function renderAllRecordsPage(): string {
    // Get counts from SourceFetched
    const total = db.query("SELECT COUNT(*) as count FROM SourceFetched").get() as any;
    const parsed = db.query("SELECT COUNT(*) as count FROM SourceFetched WHERE parsed = 1").get() as any;
    const unparsed = db.query("SELECT COUNT(*) as count FROM SourceFetched WHERE parsed = 0").get() as any;

    const recordStats = [
        { name: 'Total Records', count: total.count || 0, type: 'total' },
        { name: 'Parsed', count: parsed.count || 0, type: 'parsed' },
        { name: 'Unparsed', count: unparsed.count || 0, type: 'unparsed' },
    ];

    const recordTypesHtml = recordStats.map(rt => `
        <div class="record-type-card">
            <div class="record-type-count">${(rt.count || 0).toLocaleString()}</div>
            <div class="record-type-name">${rt.name}</div>
        </div>
    `).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>All Records</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #0d1117;
            color: #c9d1d9;
            padding: 20px;
        }
        .container { max-width: 1400px; margin: 0 auto; }
        .back-link { color: #58a6ff; text-decoration: none; margin-bottom: 20px; display: inline-block; }
        .back-link:hover { text-decoration: underline; }
        
        header { margin-bottom: 30px; }
        h1 { font-size: 28px; color: #58a6ff; margin-bottom: 8px; }
        
        .summary {
            background: #161b22;
            border: 1px solid #30363d;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 30px;
            text-align: center;
        }
        .summary .total { font-size: 36px; color: #58a6ff; font-weight: bold; }
        .summary .label { font-size: 14px; color: #8b949e; margin-top: 8px; }
        
        .record-types-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 16px;
            margin-bottom: 30px;
        }
        .record-type-card {
            background: #161b22;
            border: 1px solid #30363d;
            border-radius: 8px;
            padding: 20px;
            text-align: center;
            cursor: pointer;
            transition: all 0.2s;
        }
        .record-type-card:hover {
            background: #0d1117;
            border-color: #58a6ff;
            transform: translateY(-2px);
        }
        .record-type-count {
            font-size: 28px;
            color: #58a6ff;
            font-weight: bold;
        }
        .record-type-name {
            font-size: 14px;
            color: #8b949e;
            margin-top: 8px;
        }
    </style>
</head>
<body>
    <div class="container">
        <a href="/" class="back-link">← Back to Home</a>
        
        <header>
            <h1>All Records</h1>
            <p style="color: #8b949e;">Browse all SourceFetched records</p>
        </header>

        <div class="summary">
            <div class="total">${(total.count || 0).toLocaleString()}</div>
            <div class="label">Total Fetched Records</div>
        </div>

        <div class="record-types-grid">
            ${recordTypesHtml}
        </div>
    </div>

    <script>
        function filterByType(type) {
            alert('Filter by ' + type + ' coming soon');
        }
    </script>
</body>
</html>`;
}

// HTML for records page - shows a specific SourceFetched record
function renderRecordsPage(recordId: number): string {
    const record = db.query("SELECT * FROM SourceFetched WHERE id = ?").get(recordId) as any;
    if (!record) {
        return `<!DOCTYPE html>
<html><head><title>Record Not Found</title></head>
<body><h1>Record not found</h1></body></html>`;
    }

    const source = db.query("SELECT * FROM Source WHERE id = ?").get(record.sourceId) as any;
    
    // Read the fetched content
    let content: string | null = null;
    if (record.contentLink.startsWith("file://")) {
        const filepath = record.contentLink.slice(7);
        try {
            content = readFileSync(filepath, 'utf-8');
        } catch {
            content = null;
        }
    }

    // Escape content for use in iframe srcdoc
    const escapedContent = content ? 
        content.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Record #${recordId}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #0d1117;
            color: #c9d1d9;
            padding: 20px;
        }
        .container { max-width: 1400px; margin: 0 auto; }
        .back-link { color: #58a6ff; text-decoration: none; margin-bottom: 20px; display: inline-block; }
        .back-link:hover { text-decoration: underline; }
        
        header { margin-bottom: 30px; }
        h1 { font-size: 28px; color: #58a6ff; margin-bottom: 8px; }
        
        .info-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 16px;
            margin-bottom: 30px;
        }
        .info-card {
            background: #161b22;
            border: 1px solid #30363d;
            border-radius: 8px;
            padding: 16px;
        }
        .info-label {
            font-size: 12px;
            color: #8b949e;
            text-transform: uppercase;
            margin-bottom: 8px;
        }
        .info-value {
            font-size: 14px;
            color: #58a6ff;
            word-break: break-all;
        }
        
        .content-section {
            background: #161b22;
            border: 1px solid #30363d;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 30px;
        }
        .content-section h2 {
            font-size: 20px;
            color: #79c0ff;
            margin-bottom: 16px;
        }
        .content-iframe {
            width: 100%;
            height: 600px;
            border: 1px solid #30363d;
            border-radius: 6px;
            background: white;
        }
    </style>
</head>
<body>
    <div class="container">
        <a href="/records" class="back-link">← Back to Records</a>
        
        <header>
            <h1>SourceFetched Record #${recordId}</h1>
            <p style="color: #8b949e;">${source ? source.sourceType : 'Unknown'}</p>
        </header>

        <div class="info-grid">
            <div class="info-card">
                <div class="info-label">Source ID</div>
                <div class="info-value">${record.sourceId}</div>
            </div>
            <div class="info-card">
                <div class="info-label">Fetched At</div>
                <div class="info-value">${new Date(record.fetchedAt).toLocaleString()}</div>
            </div>
            <div class="info-card">
                <div class="info-label">Content Type</div>
                <div class="info-value">${record.contentType}</div>
            </div>
            <div class="info-card">
                <div class="info-label">Parsed</div>
                <div class="info-value">${record.parsed ? '✓ Yes' : '✗ No'}</div>
            </div>
            <div class="info-card">
                <div class="info-label">Content Hash</div>
                <div class="info-value" title="${record.contentHash}">${record.contentHash.substring(0, 16)}...</div>
            </div>
            <div class="info-card">
                <div class="info-label">Content Link</div>
                <div class="info-value" style="font-size: 12px;">${record.contentLink}</div>
            </div>
        </div>

        <div class="content-section">
            <h2>Fetched Content</h2>
            ${content ? `<iframe class="content-iframe" sandbox="allow-same-origin"></iframe>
            <script>
                const frame = document.querySelector('.content-iframe');
                frame.srcdoc = \`${escapedContent}\`;
            </script>` : '<p style="color: #8b949e;">No content available</p>'}
        </div>
    </div>
</body>
</html>`;
}

// API routes
function handleAPI(pathname: string): Response | null {
    if (pathname === '/api/stats') {
        return new Response(JSON.stringify(getStats()), {
            headers: { 'Content-Type': 'application/json' }
        });
    }

    if (pathname === '/api/sources') {
        return new Response(JSON.stringify(getAllSources()), {
            headers: { 'Content-Type': 'application/json' }
        });
    }

    if (pathname === '/api/health') {
        return new Response(JSON.stringify({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            database: 'connected',
            version: '1.0.0'
        }), {
            headers: { 'Content-Type': 'application/json' }
        });
    }

    return null;
}

// Server
Bun.serve({
    port: PORT,
    fetch(req) {
        const url = new URL(req.url);
        const pathname = url.pathname;

        // API routes
        const apiResponse = handleAPI(pathname);
        if (apiResponse) return apiResponse;

        // HTML routes
        if (pathname === '/' || pathname === '/home') {
            return new Response(renderHome(getStats()), {
                headers: { 'Content-Type': 'text/html' }
            });
        }

        if (pathname === '/sources') {
            return new Response(renderSourcesList(getAllSources()), {
                headers: { 'Content-Type': 'text/html' }
            });
        }

        if (pathname.match(/^\/sources\/\d+$/)) {
            const sourceId = parseInt(pathname.split('/')[2]);
            return new Response(renderSourceDetail(sourceId), {
                headers: { 'Content-Type': 'text/html' }
            });
        }

        if (pathname.match(/^\/sources\/\d+\/fetches\/\d+$/)) {
            const parts = pathname.split('/');
            const sourceId = parseInt(parts[2]);
            const fetchId = parseInt(parts[4]);
            return new Response(renderSourceContent(sourceId, fetchId), {
                headers: { 'Content-Type': 'text/html; charset=utf-8' }
            });
        }

        if (pathname === '/records') {
            return new Response(renderAllRecordsPage(), {
                headers: { 'Content-Type': 'text/html' }
            });
        }

        if (pathname.match(/^\/records\/\d+$/)) {
            const sourceId = parseInt(pathname.split('/')[2]);
            return new Response(renderRecordsPage(sourceId), {
                headers: { 'Content-Type': 'text/html' }
            });
        }

        if (pathname === '/status') {
            return new Response(renderStatusPage(getStats(), getAllSources(), getRecentFetches()), {
                headers: { 'Content-Type': 'text/html' }
            });
        }

        if (pathname === '/api') {
            return new Response(renderAPIDocumentation(), {
                headers: { 'Content-Type': 'text/html' }
            });
        }

        return new Response('Not Found', { status: 404 });
    },
});

// Status page (full detailed view with auto-refresh)
function renderStatusPage(stats: ReturnType<typeof getStats>, sources: ReturnType<typeof getAllSources>, recentFetches: ReturnType<typeof getRecentFetches>): string {
    const groupedBySources = sources.reduce((acc, src) => {
        if (!acc[src.sourceType]) acc[src.sourceType] = [];
        acc[src.sourceType].push(src);
        return acc;
    }, {} as Record<string, any[]>);

    let sourceGroupsHtml = '';
    for (const [type, srcs] of Object.entries(groupedBySources)) {
        sourceGroupsHtml += `
        <div class="source-group">
            <h3>${type}</h3>
            <table class="source-table">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Identifier</th>
                        <th>Status</th>
                        <th>Next Fetch</th>
                        <th>Fetched</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${srcs.map(src => `
                    <tr>
                        <td>${src.id}</td>
                        <td>${src.sourceIdentifier || '—'}</td>
                        <td><span class="status-badge ${src.status.toLowerCase()}">${src.status}</span></td>
                        <td>${src.nextFetchIn}</td>
                        <td>${src.savedCount}</td>
                        <td><a href="/sources/${src.id}">View</a></td>
                    </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>`;
    }

    const recentFetchesHtml = recentFetches.map(f => `
        <div class="recent-item">
            <div class="recent-type">${f.sourceType}</div>
            <div class="recent-identifier">${f.sourceIdentifier || '—'}</div>
            <div class="recent-status ${f.parsed ? 'parsed' : 'unparsed'}">${f.parsed ? 'Parsed' : 'Unparsed'}</div>
            <div class="recent-time">${formatRelativeTime(f.fetchedAt)}</div>
        </div>
    `).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="refresh" content="30">
    <title>Status - Langara Course Data</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #0d1117;
            color: #c9d1d9;
            padding: 20px;
        }
        .container { max-width: 1400px; margin: 0 auto; }
        .back-link { color: #58a6ff; text-decoration: none; display: inline-block; margin-bottom: 20px; }
        .back-link:hover { text-decoration: underline; }
        
        header { margin-bottom: 30px; }
        h1 { font-size: 28px; color: #58a6ff; margin-bottom: 8px; }
        
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            gap: 12px;
            margin-bottom: 30px;
        }
        .stat-card {
            background: #161b22;
            border: 1px solid #30363d;
            border-radius: 6px;
            padding: 16px;
            text-align: center;
        }
        .stat-value { font-size: 24px; font-weight: bold; color: #58a6ff; }
        .stat-label { font-size: 12px; color: #8b949e; margin-top: 4px; }
        
        .source-group { margin-bottom: 30px; }
        .source-group h3 { 
            font-size: 16px;
            color: #79c0ff;
            margin-bottom: 12px;
            padding-bottom: 8px;
            border-bottom: 1px solid #30363d;
        }
        .source-table {
            width: 100%;
            border-collapse: collapse;
            background: #161b22;
            border: 1px solid #30363d;
            border-radius: 6px;
            overflow: hidden;
        }
        .source-table thead {
            background: #0d1117;
            border-bottom: 1px solid #30363d;
        }
        .source-table th {
            padding: 12px;
            text-align: left;
            font-size: 13px;
            font-weight: 600;
            color: #8b949e;
            text-transform: uppercase;
        }
        .source-table td {
            padding: 12px;
            font-size: 13px;
            border-bottom: 1px solid #30363d;
        }
        .source-table a {
            color: #58a6ff;
            text-decoration: none;
        }
        .source-table a:hover { text-decoration: underline; }
        
        .status-badge {
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 600;
            display: inline-block;
        }
        .status-badge.ok {
            background: #238636;
            color: #aaffc9;
        }
        .status-badge.due {
            background: #da3633;
            color: #ffb3b0;
        }
        .status-badge.inactive {
            background: #6e40aa;
            color: #d8b9ff;
        }
        
        .recent-section { margin-top: 40px; }
        .recent-section h2 { font-size: 20px; color: #79c0ff; margin-bottom: 16px; }
        .recent-item {
            display: grid;
            grid-template-columns: 150px 1fr 100px 120px;
            gap: 16px;
            align-items: center;
            padding: 12px;
            background: #161b22;
            border: 1px solid #30363d;
            border-radius: 6px;
            margin-bottom: 8px;
            font-size: 13px;
        }
        .recent-status {
            padding: 4px 8px;
            border-radius: 4px;
            text-align: center;
            font-size: 11px;
            font-weight: 600;
        }
        .recent-status.parsed {
            background: #238636;
            color: #aaffc9;
        }
        .recent-status.unparsed {
            background: #da3633;
            color: #ffb3b0;
        }
    </style>
</head>
<body>
    <div class="container">
        <a href="/" class="back-link">← Home</a>
        
        <header>
            <h1>📊 System Status</h1>
            <p style="color: #8b949e; font-size: 12px;">Auto-refreshing every 30 seconds</p>
        </header>

        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-label">Total Sources</div>
                <div class="stat-value">${stats.totalSources}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Active</div>
                <div class="stat-value">${stats.activeSources}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Due</div>
                <div class="stat-value">${stats.dueSources}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Fetched</div>
                <div class="stat-value">${stats.totalFetched}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Parsed</div>
                <div class="stat-value">${stats.totalParsed}</div>
            </div>
        </div>

        ${sourceGroupsHtml}

        <div class="recent-section">
            <h2>Recent Fetches</h2>
            <div>
                ${recentFetchesHtml || '<p style="color: #8b949e;">No recent fetches</p>'}
            </div>
        </div>
    </div>
</body>
</html>`;
}

// API Documentation page
function renderAPIDocumentation(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>API Documentation - Langara Course Data</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #0d1117;
            color: #c9d1d9;
            padding: 20px;
        }
        .container { max-width: 1000px; margin: 0 auto; }
        .back-link { color: #58a6ff; text-decoration: none; display: inline-block; margin-bottom: 20px; }
        .back-link:hover { text-decoration: underline; }
        
        header { margin-bottom: 30px; }
        h1 { font-size: 28px; color: #58a6ff; margin-bottom: 8px; }
        
        .endpoint {
            background: #161b22;
            border: 1px solid #30363d;
            border-radius: 6px;
            padding: 20px;
            margin-bottom: 20px;
        }
        .endpoint-title {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 12px;
        }
        .method {
            padding: 4px 8px;
            border-radius: 4px;
            font-weight: 600;
            font-size: 12px;
        }
        .method.get { background: #238636; color: #aaffc9; }
        .method.post { background: #0969da; color: #79c0ff; }
        .endpoint-path {
            font-family: monospace;
            color: #79c0ff;
            font-size: 14px;
        }
        .endpoint-desc {
            color: #8b949e;
            font-size: 14px;
            margin-bottom: 12px;
            line-height: 1.5;
        }
        
        .response-example {
            background: #0d1117;
            border: 1px solid #30363d;
            border-radius: 4px;
            padding: 12px;
            margin-top: 12px;
            font-family: monospace;
            font-size: 12px;
            overflow-x: auto;
        }
        
        h2 { font-size: 20px; color: #79c0ff; margin: 30px 0 20px 0; }
    </style>
</head>
<body>
    <div class="container">
        <a href="/" class="back-link">← Home</a>
        
        <header>
            <h1>🔌 API Documentation</h1>
            <p style="color: #8b949e;">RESTful API for accessing course data</p>
        </header>

        <h2>System Health</h2>
        
        <div class="endpoint">
            <div class="endpoint-title">
                <span class="method get">GET</span>
                <span class="endpoint-path">/api/health</span>
            </div>
            <p class="endpoint-desc">Check system health and connectivity status</p>
            <div class="response-example">
{
  "status": "healthy",
  "timestamp": "2024-12-06T12:00:00.000Z",
  "database": "connected",
  "version": "1.0.0"
}
            </div>
        </div>

        <h2>Statistics</h2>
        
        <div class="endpoint">
            <div class="endpoint-title">
                <span class="method get">GET</span>
                <span class="endpoint-path">/api/stats</span>
            </div>
            <p class="endpoint-desc">Get aggregate statistics about fetches and parsing</p>
            <div class="response-example">
{
  "totalSources": 45,
  "activeSources": 44,
  "dueSources": 2,
  "totalFetched": 234,
  "totalParsed": 198
}
            </div>
        </div>

        <h2>Sources</h2>
        
        <div class="endpoint">
            <div class="endpoint-title">
                <span class="method get">GET</span>
                <span class="endpoint-path">/api/sources</span>
            </div>
            <p class="endpoint-desc">List all data sources with current status</p>
            <div class="response-example">
[
  {
    "id": 1,
    "sourceType": "SemesterSearch",
    "sourceIdentifier": "202410",
    "fetchFrequency": 24,
    "status": "OK",
    "isActive": true,
    "nextFetchIn": "in 5h"
  }
]
            </div>
        </div>

        <h2>Future Endpoints</h2>
        <p style="color: #8b949e; margin-bottom: 20px;">The following endpoints are planned for future releases:</p>
        
        <div class="endpoint">
            <div class="endpoint-title">
                <span class="method get">GET</span>
                <span class="endpoint-path">/api/courses</span>
            </div>
            <p class="endpoint-desc">Search and retrieve course information</p>
        </div>

        <div class="endpoint">
            <div class="endpoint-title">
                <span class="method get">GET</span>
                <span class="endpoint-path">/api/transfers</span>
            </div>
            <p class="endpoint-desc">Query transfer agreement data</p>
        </div>

        <div class="endpoint">
            <div class="endpoint-title">
                <span class="method get">GET</span>
                <span class="endpoint-path">/api/schedules</span>
            </div>
            <p class="endpoint-desc">Get course schedule information</p>
        </div>
    </div>
</body>
</html>`;
}

console.log(`Service 4 running on http://localhost:${PORT}`);
