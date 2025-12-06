export interface FetchedRow {
    id: number;
    sourceId: number;
    sourceType: string;
    sourceIdentifier: string | null;
    contentType: string;
    parsed: number | boolean;
    fetchedAt: string | Date;
}

export interface FetchedPage {
    total: number;
    page: number;
    pageSize: number;
    rows: FetchedRow[];
    parsedTotal?: number;
    unparsedTotal?: number;
}

export interface RecordDetail {
    record: {
        id: number;
        sourceId: number;
        fetchedAt: string | Date;
        contentType: string;
        parsed: number | boolean;
        contentHash: string;
        contentLink: string;
    } | null;
    source?: {
        sourceType?: string;
    } | null;
    content?: string | null;
}

export function renderAllRecordsPage(paged: FetchedPage): string {
    const total = paged.total;
    const totalPages = Math.max(1, Math.ceil(total / paged.pageSize));
    const page = Math.min(Math.max(1, paged.page), totalPages);

    const parsedCount = typeof paged.parsedTotal === 'number'
        ? paged.parsedTotal
        : paged.rows.filter(r => !!r.parsed).length;
    const unparsedCount = typeof paged.unparsedTotal === 'number'
        ? paged.unparsedTotal
        : paged.rows.length - (typeof paged.parsedTotal === 'number' ? 0 : parsedCount);

    const recordStats = [
        { name: 'Total Records', count: total },
        { name: 'Parsed', count: parsedCount },
        { name: 'Unparsed', count: unparsedCount },
    ];

    const tableRows = paged.rows.map(r => `
        <tr>
            <td>${r.id}</td>
            <td><a href="/sources/${r.sourceId}" class="link">${r.sourceType}</a></td>
            <td class="mono">${r.sourceIdentifier || '—'}</td>
            <td>${r.contentType}</td>
            <td><span class="status ${r.parsed ? 'parsed' : 'unparsed'}">${r.parsed ? 'Parsed' : 'Unparsed'}</span></td>
            <td>${new Date(r.fetchedAt).toLocaleString()}</td>
            <td><a href="/records/${r.id}" class="link">View</a></td>
        </tr>
    `).join('');

    const pageLinks = () => {
        const links: string[] = [];
        const max = totalPages;
        const current = page;
        const add = (p: number, label?: string) => links.push(`<a href="/records?page=${p}" class="page-link ${p === current ? 'active' : ''}">${label || p}</a>`);
        if (current > 1) add(current - 1, 'Prev');
        const start = Math.max(1, current - 2);
        const end = Math.min(max, current + 2);
        for (let p = start; p <= end; p++) add(p);
        if (current < max) add(current + 1, 'Next');
        return links.join('');
    };

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
        header { margin-bottom: 20px; }
        h1 { font-size: 28px; color: #58a6ff; margin-bottom: 8px; }
        .subtitle { color: #8b949e; font-size: 14px; }
        .summary {
            background: #161b22;
            border: 1px solid #30363d;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            gap: 12px;
        }
        .summary-card { text-align: center; }
        .summary-card .count { font-size: 28px; color: #58a6ff; font-weight: bold; }
        .summary-card .label { font-size: 12px; color: #8b949e; text-transform: uppercase; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; background: #161b22; border: 1px solid #30363d; }
        th, td { padding: 10px 12px; border-bottom: 1px solid #30363d; font-size: 13px; }
        th { text-align: left; color: #8b949e; text-transform: uppercase; font-size: 12px; }
        tr:hover { background: #0d1117; }
        .status { padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
        .status.parsed { background: #238636; color: #aaffc9; }
        .status.unparsed { background: #da3633; color: #ffb3b0; }
        .mono { font-family: monospace; }
        .link { color: #58a6ff; text-decoration: none; }
        .link:hover { text-decoration: underline; }
        .pagination { margin-top: 16px; display: flex; gap: 8px; flex-wrap: wrap; }
        .page-link { padding: 6px 10px; border: 1px solid #30363d; border-radius: 4px; color: #58a6ff; text-decoration: none; font-size: 12px; }
        .page-link.active { background: #58a6ff; color: #0d1117; border-color: #58a6ff; }
    </style>
</head>
<body>
    <div class="container">
        <a href="/" class="back-link">← Back to Home</a>
        
        <header>
            <h1>All Records</h1>
            <p class="subtitle">Browse SourceFetched records (page ${page} of ${totalPages})</p>
        </header>

        <div class="summary">
            ${recordStats.map(rt => `
                <div class="summary-card">
                    <div class="count">${(rt.count || 0).toLocaleString()}</div>
                    <div class="label">${rt.name}</div>
                </div>
            `).join('')}
        </div>

        <table>
            <thead>
                <tr>
                    <th>ID</th>
                    <th>Source</th>
                    <th>Identifier</th>
                    <th>Content Type</th>
                    <th>Parsed</th>
                    <th>Fetched At</th>
                    <th>Action</th>
                </tr>
            </thead>
            <tbody>
                ${tableRows || '<tr><td colspan="7" style="text-align:center; color:#8b949e;">No records</td></tr>'}
            </tbody>
        </table>

        <div class="pagination">${pageLinks()}</div>
    </div>
</body>
</html>`;
}

export function renderRecordsPage(data: RecordDetail): string {
    if (!data.record) {
        return `<!DOCTYPE html>
<html><head><title>Record Not Found</title></head>
<body><h1>Record not found</h1></body></html>`;
    }

    const { record, source, content } = data;
    const escapedContent = content ? 
        content.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Record #${record.id}</title>
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
            <h1>SourceFetched Record #${record.id}</h1>
            <p style="color: #8b949e;">${source?.sourceType || 'Unknown'}</p>
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
