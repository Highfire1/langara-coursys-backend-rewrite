import { formatRelativeTime } from "../utils/time";

export interface StatusStats {
    totalSources: number;
    activeSources: number;
    dueSources: number;
    totalFetched: number;
    totalParsed: number;
}

export interface StatusSource {
    id: number;
    sourceType: string;
    sourceIdentifier: string | null;
    status: string;
    nextFetchIn: string;
    savedCount: number;
}

export interface RecentFetch {
    id: number;
    sourceId: number;
    sourceType: string;
    sourceIdentifier: string | null;
    fetchedAt: string | Date;
    parsed: boolean;
}

export function renderStatusPage(stats: StatusStats, sources: StatusSource[], recentFetches: RecentFetch[]): string {
    const groupedBySources = sources.reduce((acc, src) => {
        if (!acc[src.sourceType]) acc[src.sourceType] = [] as StatusSource[];
        acc[src.sourceType].push(src);
        return acc;
    }, {} as Record<string, StatusSource[]>);

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
            <div class="recent-time">${formatRelativeTime(new Date(f.fetchedAt))}</div>
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
