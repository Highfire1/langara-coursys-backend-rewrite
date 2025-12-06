export function renderSourceContent(content: string | null, sourceId: number): string {
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
