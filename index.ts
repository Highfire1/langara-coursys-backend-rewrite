import { spawn } from "bun";

const processes: ReturnType<typeof spawn>[] = [];

function prefixLines(stream: ReadableStream<Uint8Array>, prefix: string, dest: NodeJS.WriteStream) {
    const decoder = new TextDecoder();
    let buf = "";
    const reader = stream.getReader();
    (async () => {
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                if (buf) dest.write(`${prefix} ${buf}\n`);
                break;
            }
            buf += decoder.decode(value, { stream: true });
            const lines = buf.split("\n");
            buf = lines.pop()!;
            for (const line of lines) dest.write(`${prefix} ${line}\n`);
        }
    })().catch(console.error);
}

async function startServer() {
    console.log("[serve] Starting server on port 3000...");
    const server = spawn({
        cmd: ["bun", "run", "serve.ts"],
        cwd: import.meta.dir,
        stdout: "pipe",
        stderr: "pipe",
        stdin: "inherit",
    });
    prefixLines(server.stdout, "[serve]", process.stdout);
    prefixLines(server.stderr, "[serve]", process.stderr);
    processes.push(server);
    return server;
}

async function startFetch() {
    console.log("[fetch] Starting fetch service...");
    const fetcher = spawn({
        cmd: ["bun", "run", "fetch.ts"],
        cwd: import.meta.dir,
        stdout: "pipe",
        stderr: "pipe",
        stdin: "inherit",
    });
    prefixLines(fetcher.stdout, "[fetch]", process.stdout);
    prefixLines(fetcher.stderr, "[fetch]", process.stderr);
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
