export interface SourceFetchInfo {
    id: number;
    fetchedAt: string | Date;
    parsed: boolean;
    contentHash: string;
}

export interface SourceDetailData {
    id: number;
    sourceType: string;
    sourceIdentifier: string | null;
    fetchFrequency: number;
    nextFetchIn: string;
    lastFetched: string | Date | null;
    lastSaved: string | Date | null;
    savedCount: number;
    status: string;
    isActive: boolean;
    latestContent: string | null;
    latestContentId: number | null;
    recentFetches: SourceFetchInfo[];
}

export function renderSourceDetail(data: SourceDetailData | null): string {
    if (!data) {
        return `<!DOCTYPE html>
<html><head><title>Source Not Found</title></head>
<body><h1>Source not found</h1></body></html>`;
    }

    const fetchesHtml = data.recentFetches.map(f => `
        <div class="fetch-item ${f.id === data.latestContentId ? 'latest' : ''}">
            <div class="fetch-time">${new Date(f.fetchedAt).toLocaleString()}</div>
            <div class="fetch-status ${f.parsed ? 'parsed' : 'unparsed'}">${f.parsed ? 'Parsed' : 'Unparsed'}</div>
            <div class="fetch-hash" title="${f.contentHash}">${f.contentHash.substring(0, 8)}...</div>
            ${f.id === data.latestContentId ? '<span class="latest-badge">Latest</span>' : `<a href="/sources/${data.id}/fetches/${f.id}" class="fetch-link">View</a>`}
        </div>
    `).join('');

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
                <div class="info-value">${data.lastFetched ? new Date(data.lastFetched).toLocaleString() : 'Never'}</div>
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
