import { spawn } from "bun";

const processes: ReturnType<typeof spawn>[] = [];

async function startServer() {
    console.log("Starting server on port 3000...");
    const server = spawn({
        cmd: ["bun", "run", "serve/index.ts"],
        cwd: import.meta.dir,
        stdout: "inherit",
        stderr: "inherit",
        stdin: "inherit",
    });
    processes.push(server);
    return server;
}

async function startFetch() {
    console.log("Starting fetch service...");
    const fetcher = spawn({
        cmd: ["bun", "run", "fetch/index.ts"],
        cwd: import.meta.dir,
        stdout: "inherit",
        stderr: "inherit",
        stdin: "inherit",
    });
    processes.push(fetcher);
    return fetcher;
}

async function main() {
    // Start both services
    await Promise.all([startServer(), startFetch()]);

    // Handle cleanup
    const cleanup = () => {
        console.log("\nShutting down services...");
        processes.forEach(p => p.kill());
        process.exit(0);
    };

    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
}

main().catch(console.error);
