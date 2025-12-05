// Service 4: Status page and API server

import { Database } from "bun:sqlite";

const db = new Database("database.sqlite", { create: true });

// Get all sources with their status
function getSources() {
    return db.query(`
        SELECT 
            s.*,
            (SELECT COUNT(*) FROM SourceFetched sf WHERE sf.sourceId = s.id) as fetchedCount,
            (SELECT COUNT(*) FROM SourceFetched sf WHERE sf.sourceId = s.id AND sf.parsed = 1) as parsedCount
        FROM Source s
        ORDER BY s.sourceType, s.sourceIdentifier
    `).all() as any[];
}

// Get recent fetches
function getRecentFetches(limit: number = 20) {
    return db.query(`
        SELECT sf.*, s.sourceType, s.sourceIdentifier
        FROM SourceFetched sf
        JOIN Source s ON sf.sourceId = s.id
        ORDER BY sf.fetchedAt DESC
        LIMIT ?
    `).all(limit) as any[];
}

// Get summary stats
function getStats() {
    const totalSources = db.query(`SELECT COUNT(*) as count FROM Source`).get() as { count: number };
    const activeSources = db.query(`SELECT COUNT(*) as count FROM Source WHERE isActive = 1`).get() as { count: number };
    const totalFetched = db.query(`SELECT COUNT(*) as count FROM SourceFetched`).get() as { count: number };
    const totalParsed = db.query(`SELECT COUNT(*) as count FROM SourceFetched WHERE parsed = 1`).get() as { count: number };
    const dueSources = db.query(`SELECT COUNT(*) as count FROM Source WHERE nextFetch <= datetime('now') AND isActive = 1`).get() as { count: number };
    
    return {
        totalSources: totalSources.count,
        activeSources: activeSources.count,
        totalFetched: totalFetched.count,
        totalParsed: totalParsed.count,
        dueSources: dueSources.count
    };
}

// Format date for display
function formatDate(dateStr: string | null): string {
    if (!dateStr) return '<span class="text-gray">Never</span>';
    const date = new Date(dateStr);
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    const diffMins = Math.round(diff / 60000);
    const diffHours = Math.round(diff / 3600000);
    
    const timeStr = date.toLocaleString();
    
    if (diff > 0) {
        // Future
        if (diffMins < 60) return `<span class="text-blue">${timeStr}</span> <small>(in ${diffMins}m)</small>`;
        return `<span class="text-blue">${timeStr}</span> <small>(in ${diffHours}h)</small>`;
    } else {
        // Past
        const absMins = Math.abs(diffMins);
        const absHours = Math.abs(diffHours);
        if (absMins < 60) return `<span class="text-green">${timeStr}</span> <small>(${absMins}m ago)</small>`;
        if (absHours < 24) return `<span class="text-green">${timeStr}</span> <small>(${absHours}h ago)</small>`;
        return `<span class="text-yellow">${timeStr}</span> <small>(${Math.round(absHours/24)}d ago)</small>`;
    }
}

// Generate status badge
function statusBadge(source: any): string {
    const now = new Date();
    const nextFetch = new Date(source.nextFetch);
    
    if (!source.isActive) return '<span class="badge badge-gray">Inactive</span>';
    if (nextFetch <= now) return '<span class="badge badge-orange">Due</span>';
    return '<span class="badge badge-green">OK</span>';
}

// Generate the HTML page
function generateHTML(): string {
    const sources = getSources();
    const recentFetches = getRecentFetches();
    const stats = getStats();
    
    // Group sources by type
    const groupedSources: Record<string, any[]> = {};
    for (const source of sources) {
        if (!groupedSources[source.sourceType]) {
            groupedSources[source.sourceType] = [];
        }
        groupedSources[source.sourceType].push(source);
    }
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="refresh" content="30">
    <title>Langara CourseSys - Status</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #0d1117; 
            color: #c9d1d9; 
            padding: 20px;
            line-height: 1.5;
        }
        .container { max-width: 1400px; margin: 0 auto; }
        h1 { color: #58a6ff; margin-bottom: 20px; }
        h2 { color: #8b949e; margin: 30px 0 15px; font-size: 1.1rem; text-transform: uppercase; letter-spacing: 1px; }
        
        .stats { 
            display: grid; 
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); 
            gap: 15px; 
            margin-bottom: 30px; 
        }
        .stat-card { 
            background: #161b22; 
            border: 1px solid #30363d; 
            border-radius: 8px; 
            padding: 20px; 
            text-align: center;
        }
        .stat-card .number { font-size: 2rem; font-weight: bold; color: #58a6ff; }
        .stat-card .label { color: #8b949e; font-size: 0.85rem; margin-top: 5px; }
        
        table { 
            width: 100%; 
            border-collapse: collapse; 
            background: #161b22; 
            border: 1px solid #30363d; 
            border-radius: 8px;
            overflow: hidden;
            margin-bottom: 20px;
        }
        th, td { padding: 12px 15px; text-align: left; border-bottom: 1px solid #30363d; }
        th { background: #21262d; color: #8b949e; font-weight: 600; font-size: 0.85rem; text-transform: uppercase; }
        tr:hover { background: #1c2128; }
        tr:last-child td { border-bottom: none; }
        
        .badge {
            display: inline-block;
            padding: 3px 10px;
            border-radius: 20px;
            font-size: 0.75rem;
            font-weight: 600;
        }
        .badge-green { background: #238636; color: #fff; }
        .badge-orange { background: #9e6a03; color: #fff; }
        .badge-gray { background: #484f58; color: #8b949e; }
        .badge-blue { background: #1f6feb; color: #fff; }
        
        .text-gray { color: #6e7681; }
        .text-green { color: #3fb950; }
        .text-blue { color: #58a6ff; }
        .text-yellow { color: #d29922; }
        .text-mono { font-family: monospace; font-size: 0.9rem; }
        
        small { color: #6e7681; }
        
        .section-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .count-badge {
            background: #30363d;
            padding: 3px 10px;
            border-radius: 20px;
            font-size: 0.8rem;
        }
        
        .refresh-info {
            text-align: right;
            color: #6e7681;
            font-size: 0.85rem;
            margin-bottom: 20px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>📊 Langara CourseSys Status</h1>
        <div class="refresh-info">Auto-refreshes every 30 seconds • Last updated: ${new Date().toLocaleString()}</div>
        
        <div class="stats">
            <div class="stat-card">
                <div class="number">${stats.totalSources}</div>
                <div class="label">Total Sources</div>
            </div>
            <div class="stat-card">
                <div class="number">${stats.activeSources}</div>
                <div class="label">Active Sources</div>
            </div>
            <div class="stat-card">
                <div class="number" style="color: ${stats.dueSources > 0 ? '#d29922' : '#3fb950'}">${stats.dueSources}</div>
                <div class="label">Due for Fetch</div>
            </div>
            <div class="stat-card">
                <div class="number">${stats.totalFetched}</div>
                <div class="label">Total Fetched</div>
            </div>
            <div class="stat-card">
                <div class="number">${stats.totalParsed}</div>
                <div class="label">Parsed</div>
            </div>
        </div>
        
        ${Object.entries(groupedSources).map(([sourceType, sources]) => `
            <div class="section-header">
                <h2>${sourceType}</h2>
                <span class="count-badge">${sources.length} sources</span>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Status</th>
                        <th>ID</th>
                        <th>Identifier</th>
                        <th>Frequency</th>
                        <th>Next Fetch</th>
                        <th>Last Fetched</th>
                        <th>Last Saved</th>
                        <th>Saved</th>
                        <th>Parsed</th>
                    </tr>
                </thead>
                <tbody>
                    ${sources.map(s => `
                        <tr>
                            <td>${statusBadge(s)}</td>
                            <td class="text-mono">${s.id}</td>
                            <td class="text-mono">${s.sourceIdentifier || '-'}</td>
                            <td>${s.fetchFrequency}h</td>
                            <td>${formatDate(s.nextFetch)}</td>
                            <td>${formatDate(s.lastFetched)}</td>
                            <td>${formatDate(s.lastSaved)}</td>
                            <td>${s.fetchedCount}</td>
                            <td>${s.parsedCount}/${s.fetchedCount}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `).join('')}
        
        <h2>Recent Fetches</h2>
        <table>
            <thead>
                <tr>
                    <th>Fetched At</th>
                    <th>Source Type</th>
                    <th>Identifier</th>
                    <th>Content Type</th>
                    <th>Parsed</th>
                    <th>Content Link</th>
                </tr>
            </thead>
            <tbody>
                ${recentFetches.map(f => `
                    <tr>
                        <td>${formatDate(f.fetchedAt)}</td>
                        <td>${f.sourceType}</td>
                        <td class="text-mono">${f.sourceIdentifier || '-'}</td>
                        <td><span class="badge badge-blue">${f.contentType}</span></td>
                        <td>${f.parsed ? '<span class="badge badge-green">Yes</span>' : '<span class="badge badge-gray">No</span>'}</td>
                        <td class="text-mono" style="max-width: 300px; overflow: hidden; text-overflow: ellipsis;">${f.contentLink}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    </div>
</body>
</html>`;
}

// Start the server
const server = Bun.serve({
    port: 3000,
    fetch(req) {
        const url = new URL(req.url);
        
        if (url.pathname === "/" || url.pathname === "/status") {
            return new Response(generateHTML(), {
                headers: { "Content-Type": "text/html" }
            });
        }
        
        if (url.pathname === "/api/sources") {
            return Response.json(getSources());
        }
        
        if (url.pathname === "/api/stats") {
            return Response.json(getStats());
        }
        
        if (url.pathname === "/api/recent") {
            return Response.json(getRecentFetches());
        }
        
        return new Response("Not Found", { status: 404 });
    }
});

console.log(`🚀 Status server running at http://localhost:${server.port}`);
