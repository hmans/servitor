import { readFileSync, existsSync } from 'fs';
import { parse as parseYaml } from 'yaml';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { sveltekit } from '@sveltejs/kit/vite';

function getPortFromConfig(): number | undefined {
  try {
    if (!existsSync('.servitor.yml')) return undefined;
    const yaml = parseYaml(readFileSync('.servitor.yml', 'utf-8')) ?? {};
    const servitorYaml =
      typeof yaml.servitor === 'object' && yaml.servitor !== null
        ? (yaml.servitor as Record<string, unknown>)
        : {};
    if (typeof servitorYaml.port === 'number') return servitorYaml.port;
  } catch {
    // ignore
  }
  return undefined;
}

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  server: { port: getPortFromConfig() },
  ssr: {
    external: ['pino', 'pino-pretty']
  },
  test: {
    expect: { requireAssertions: true },
    projects: [
      {
        extends: './vite.config.ts',
        test: {
          name: 'client',
          browser: {
            enabled: true,
            provider: playwright(),
            instances: [{ browser: 'chromium', headless: true }]
          },
          include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
          exclude: ['src/lib/server/**']
        }
      },

      {
        extends: './vite.config.ts',
        test: {
          name: 'server',
          environment: 'node',
          include: ['src/**/*.{test,spec}.{js,ts}'],
          exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
        }
      }
    ]
  }
});
