export interface SourceListItem {
    id: number;
    sourceType: string;
    sourceIdentifier: string | null;
    status: string;
    nextFetchIn: string;
}

export function renderSourcesList(sources: SourceListItem[]): string {
    const sourcesByType = sources.reduce((acc, src) => {
        if (!acc[src.sourceType]) acc[src.sourceType] = [] as SourceListItem[];
        acc[src.sourceType].push(src);
        return acc;
    }, {} as Record<string, SourceListItem[]>);

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
