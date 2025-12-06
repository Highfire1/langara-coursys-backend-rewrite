import { spawn } from "bun";

console.log("Starting Service 3 (API) and Service 4 (Frontend)...\n");

const service3 = spawn({
    cmd: ["bun", "run", "3/index.ts"],
    cwd: import.meta.dir,
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
});

const service4 = spawn({
    cmd: ["bun", "run", "4/index.ts"],
    cwd: import.meta.dir,
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
});

// Handle cleanup
process.on("SIGINT", () => {
    console.log("\nShutting down services...");
    service3.kill();
    service4.kill();
    process.exit(0);
});

process.on("SIGTERM", () => {
    service3.kill();
    service4.kill();
    process.exit(0);
});

// Wait for both processes
await Promise.all([service3.exited, service4.exited]);
