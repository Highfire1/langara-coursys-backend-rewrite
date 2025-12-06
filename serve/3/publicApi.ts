import { Database } from "bun:sqlite";

const headers = { "Content-Type": "application/json" } as const;

function getDistinctSubjects(db: Database) {
    const rows = db
        .query("SELECT DISTINCT subject FROM Section ORDER BY subject ASC")
        .all() as { subject: string }[];
    return rows.map(r => r.subject);
}

function buildOpenAPISpec() {
    return {
        openapi: "3.1.0",
        info: {
            title: "Langara Course Data Public API",
            version: "1.0.0",
            description: "Public read-only API for course and transfer data",
        },
        servers: [{ url: "/v3" }],
        paths: {
            "/health": {
                get: {
                    summary: "Health check",
                    responses: {
                        200: {
                            description: "Service is healthy",
                            content: {
                                "application/json": {
                                    schema: {
                                        type: "object",
                                        properties: {
                                            status: { type: "string" },
                                            timestamp: { type: "string", format: "date-time" },
                                            database: { type: "string" },
                                            version: { type: "string" },
                                        },
                                        required: ["status", "timestamp", "database", "version"],
                                    },
                                },
                            },
                        },
                    },
                },
            },
            "/subjects": {
                get: {
                    summary: "List distinct subjects",
                    responses: {
                        200: {
                            description: "Array of subject codes",
                            content: {
                                "application/json": {
                                    schema: {
                                        type: "array",
                                        items: { type: "string" },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            "/openapi.json": {
                get: {
                    summary: "OpenAPI definition",
                    responses: {
                        200: {
                            description: "OpenAPI JSON document",
                            content: {
                                "application/json": {
                                    schema: { type: "object" },
                                },
                            },
                        },
                    },
                },
            },
        },
    };
}

export function handleV3(url: URL, db: Database): Response | null {
    const pathname = url.pathname;

    if (!pathname.startsWith("/v3/")) return null;

    if (pathname === "/v3/health") {
        return new Response(
            JSON.stringify({
                status: "healthy",
                timestamp: new Date().toISOString(),
                database: "connected",
                version: "1.0.0",
            }),
            { headers }
        );
    }

    if (pathname === "/v3/subjects") {
        return new Response(JSON.stringify(getDistinctSubjects(db)), { headers });
    }

    if (pathname === "/v3/openapi.json") {
        const spec = buildOpenAPISpec();
        return new Response(JSON.stringify(spec, null, 2), { headers });
    }

    return new Response(JSON.stringify({ error: "Not Found" }), {
        status: 404,
        headers,
    });
}
