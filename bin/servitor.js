#!/usr/bin/env node

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { Command } from "commander";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
	readFileSync(join(__dirname, "..", "package.json"), "utf-8")
);

const program = new Command()
	.name("servitor")
	.description("Parallel agent orchestrator for high-velocity software development")
	.version(pkg.version);

program
	.command("start", { isDefault: true })
	.description("Start the Servitor server")
	.option("-p, --port <port>", "port to listen on", process.env.PORT ?? "4173")
	.option("-H, --host <host>", "host to bind to", process.env.HOST ?? "localhost")
	.action(async (opts) => {
		try {
			execSync("git rev-parse --show-toplevel", { stdio: "pipe" });
		} catch {
			console.error("Error: servitor must be run from within a git repository.");
			process.exit(1);
		}

		process.env.PORT = opts.port;
		process.env.HOST = opts.host;

		const buildEntry = join(__dirname, "..", "build", "index.js");

		console.log(`\n  servitor v${pkg.version}`);
		console.log(`  http://${opts.host}:${opts.port}\n`);

		await import(buildEntry);
	});

program.parse();
