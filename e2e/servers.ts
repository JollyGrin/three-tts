/**
 * The two processes a table needs: `vite dev` and the Go relay.
 *
 * The relay is not optional — `/play` renders `<TableScene>` only once the
 * socket is open, so a harness without one tests an empty canvas. It is also
 * why the harness must never be pointed at the default server: `connection.ts`
 * falls back to `api.table.place` when nothing overrides it, and a test that
 * spawns dice into the public relay is a test that spawns dice into strangers'
 * tables. Both the `?server=` query param and `localStorage.serverurl` are set
 * to localhost, belt and braces.
 *
 * Either process is reused if something is already listening on its port, so
 * `bun run dev:all` in another terminal makes the harness start instantly.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { connect } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';

export const RELAY_PORT = Number(process.env.E2E_RELAY_PORT ?? 8080);

/**
 * The harness gets its OWN dev server on a random high port unless
 * `E2E_WEB_PORT` says otherwise. Never a fixed default: a run that reuses — or
 * worse, reclaims — whatever is on port 5173/5199 will take out the dev server
 * of whoever is working alongside it, which is exactly what happened while this
 * was being written. Nothing here ever kills a process it did not start.
 */
function pickWebPort(): number {
	const configured = process.env.E2E_WEB_PORT;
	if (configured) return Number(configured);
	return 34000 + Math.floor(Math.random() * 4000);
}

export type Servers = { relay: string; web: string; stop: () => Promise<void> };

/**
 * `localhost`, not `127.0.0.1`: vite binds IPv6 loopback by default, so a
 * v4-only probe reports a running dev server as down and the harness spawns a
 * second one that then fails on the port being taken.
 */
function isListening(port: number): Promise<boolean> {
	return new Promise((resolve) => {
		const socket = connect({ host: 'localhost', port });
		const settle = (open: boolean) => {
			socket.destroy();
			resolve(open);
		};
		socket.setTimeout(1000);
		socket.once('connect', () => settle(true));
		socket.once('timeout', () => settle(false));
		socket.once('error', () => settle(false));
	});
}

async function waitFor(port: number, what: string, timeoutMs = 120_000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (await isListening(port)) return;
		await sleep(250);
	}
	throw new Error(`${what} never came up on :${port} within ${timeoutMs}ms`);
}

function run(command: string[], label: string, cwd?: string): ChildProcess {
	const child = spawn(command[0], command.slice(1), {
		cwd,
		stdio: ['ignore', 'pipe', 'pipe'],
		env: { ...process.env, FORCE_COLOR: '0' }
	});
	const log = (chunk: Buffer) => {
		if (process.env.E2E_VERBOSE === '1') process.stderr.write(`[${label}] ${chunk}`);
	};
	child.stdout?.on('data', log);
	child.stderr?.on('data', log);
	return child;
}

export async function startServers(): Promise<Servers> {
	const spawned: ChildProcess[] = [];

	if (!(await isListening(RELAY_PORT))) {
		spawned.push(run(['go', 'run', 'main.go', `-addr=:${RELAY_PORT}`], 'relay', 'server'));
		await waitFor(RELAY_PORT, 'Go relay').catch((error: Error) => {
			throw new Error(
				`${error.message}\nStart it yourself with \`bun run dev:server\`, or install Go 1.24+.`
			);
		});
	}

	// A configured port may already hold a dev server the developer started, and
	// reusing it is the fast path. A random one never will.
	let webPort = pickWebPort();
	while (!(await isListening(webPort))) {
		spawned.push(
			run(['bun', 'run', 'vite', 'dev', '--port', String(webPort), '--strictPort'], 'web')
		);
		try {
			await waitFor(webPort, 'vite dev', 60_000);
			break;
		} catch (error) {
			if (process.env.E2E_WEB_PORT) throw error;
			// lost a race for the port; take another rather than reclaim this one
			spawned.pop()?.kill('SIGKILL');
			webPort = pickWebPort();
		}
	}

	return {
		relay: `localhost:${RELAY_PORT}`,
		web: `http://localhost:${webPort}`,
		stop: async () => {
			for (const child of spawned) child.kill('SIGTERM');
			await sleep(300);
			for (const child of spawned) if (child.exitCode === null) child.kill('SIGKILL');
		}
	};
}
