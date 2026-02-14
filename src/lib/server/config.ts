import { readFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import { homedir } from 'os';

export interface ServitorConfig {
	/** Base directory for all worktrees. Default: $HOME/servitor-worktrees */
	worktreesDir: string;
}

const defaults: ServitorConfig = {
	worktreesDir: join(homedir(), 'servitor-worktrees')
};

function loadConfig(): ServitorConfig {
	const configPath = resolve(process.env.SERVITOR_CONFIG ?? 'servitor.json');

	if (!existsSync(configPath)) {
		return { ...defaults };
	}

	try {
		const raw = JSON.parse(readFileSync(configPath, 'utf-8'));
		return {
			worktreesDir: raw.worktreesDir
				? resolve(raw.worktreesDir.replace(/^~/, homedir()))
				: defaults.worktreesDir
		};
	} catch (e) {
		console.warn(`[config] Failed to parse ${configPath}, using defaults:`, e);
		return { ...defaults };
	}
}

/** Singleton config — loaded once at startup */
export const config: ServitorConfig = loadConfig();
