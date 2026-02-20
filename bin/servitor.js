#!/usr/bin/env node

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
	readFileSync(join(__dirname, "..", "package.json"), "utf-8")
);

const args = process.argv.slice(2);
const command = args.find((a) => !a.startsWith("-")) ?? "start";

function parseFlag(name, fallback) {
	const i = args.indexOf(name);
	return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}

switch (command) {
	case "start": {
		// Verify we're in a git repo
		try {
			execSync("git rev-parse --show-toplevel", { stdio: "pipe" });
		} catch {
			console.error("Error: servitor must be run from within a git repository.");
			process.exit(1);
		}

		const port = parseFlag("--port", process.env.PORT ?? "4173");
		const host = parseFlag("--host", process.env.HOST ?? "localhost");

		process.env.PORT = port;
		process.env.HOST = host;

		const buildEntry = join(__dirname, "..", "build", "index.js");

		console.log(`\n  servitor v${pkg.version}`);
		console.log(`  http://${host}:${port}\n`);

		await import(buildEntry);
		break;
	}

	case "version":
		console.log(pkg.version);
		break;

	default:
		console.error(`Unknown command: ${command}\n`);
		console.log(`Usage: servitor [command] [options]\n`);
		console.log(`Commands:`);
		console.log(`  start    Start the server (default)`);
		console.log(`  version  Print version\n`);
		console.log(`Options:`);
		console.log(`  --port   Port to listen on (default: 4173)`);
		console.log(`  --host   Host to bind to (default: localhost)`);
		process.exit(1);
}
