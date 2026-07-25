/**
 * Finding and launching a real Chrome for the render harness.
 *
 * `puppeteer-core` on purpose: it downloads nothing, so CI uses whatever
 * Chrome the runner already ships (`ubuntu-latest` has one) and a developer
 * uses their own. `CHROME_PATH` overrides everything.
 *
 * The GL flags are the load-bearing part. A default headless Chrome has no GPU,
 * three.js gets a null WebGL context, and the whole table silently renders
 * nothing — which would make every assertion here vacuous. SwiftShader gives a
 * real software rasteriser, so the scene actually draws and a raycast actually
 * runs.
 */

import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import puppeteer, { type Browser } from 'puppeteer-core';

/** newest first, so a stale old download never wins over a fresh one */
function puppeteerCacheChromes(): string[] {
	const root = join(homedir(), '.cache', 'puppeteer', 'chrome');
	if (!existsSync(root)) return [];
	return readdirSync(root)
		.sort()
		.reverse()
		.flatMap((dir) => [
			join(
				root,
				dir,
				'chrome-mac-arm64',
				'Google Chrome for Testing.app',
				'Contents',
				'MacOS',
				'Google Chrome for Testing'
			),
			join(
				root,
				dir,
				'chrome-mac-x64',
				'Google Chrome for Testing.app',
				'Contents',
				'MacOS',
				'Google Chrome for Testing'
			),
			join(root, dir, 'chrome-linux64', 'chrome')
		]);
}

export function findChrome(): string {
	const candidates = [
		process.env.CHROME_PATH,
		process.env.PUPPETEER_EXECUTABLE_PATH,
		'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
		'/Applications/Chromium.app/Contents/MacOS/Chromium',
		'/usr/bin/google-chrome',
		'/usr/bin/google-chrome-stable',
		'/usr/bin/chromium',
		'/usr/bin/chromium-browser',
		...puppeteerCacheChromes()
	].filter((path): path is string => !!path);

	const found = candidates.find((path) => existsSync(path));
	if (!found) {
		throw new Error(
			`No Chrome found. Set CHROME_PATH to a Chrome/Chromium binary. Looked at:\n  ${candidates.join('\n  ')}`
		);
	}
	return found;
}

export async function launchBrowser(): Promise<Browser> {
	return puppeteer.launch({
		executablePath: findChrome(),
		headless: process.env.E2E_HEADED !== '1',
		args: [
			'--no-sandbox',
			'--disable-dev-shm-usage',
			// software WebGL — without these the canvas has no context at all
			'--use-gl=angle',
			'--use-angle=swiftshader',
			'--enable-unsafe-swiftshader',
			'--disable-gpu-sandbox',
			'--window-size=1280,900',
			// a headless tab is "hidden": rAF stops, so no frame ever renders and
			// the springs never settle
			'--disable-backgrounding-occluded-windows',
			'--disable-renderer-backgrounding',
			'--disable-background-timer-throttling'
		],
		defaultViewport: { width: 1280, height: 900 }
	});
}
