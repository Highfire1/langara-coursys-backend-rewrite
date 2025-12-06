export interface HomeStats {
    totalSources: number;
    activeSources: number;
    dueSources: number;
    totalFetched: number;
    totalParsed: number;
}

export function renderHome(stats: HomeStats): string {
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
            <a href="/records" class="link-card">
                <h3>🔌 Records</h3>
                <p>Browse fetched records with pagination.</p>
            </a>
        </div>

        <footer>
            <p>Langara Course Data System v1.0 • Built with Bun + SQLite</p>
        </footer>
    </div>
</body>
</html>`;
}
