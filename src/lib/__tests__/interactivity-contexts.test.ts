/**
 * `interactivity()` from @threlte/extras is not idempotent and not cheap:
 * every call does setContext (shadowing any parent context for that subtree),
 * builds its own Raycaster, and adds a full set of DOM listeners to the shared
 * canvas element. Calling it inside a component that renders once per deck or
 * once per card in hand therefore scaled listeners and per-pointermove raycasts
 * with the board — and, worse, split the dispatch loop, so stopPropagation
 * could not cross entity types and TableScene's custom `compute` did not apply
 * inside a Deck or a TrayCard (see #86).
 *
 * The invariant is "one context per camera": TableScene owns the table camera,
 * HUDTrayScene owns an OrthographicCamera that `<HUD>`'s createCameraContext
 * re-roots, and a Raycaster can only be set from one camera. Nothing else may
 * call it — a component gets handlers by having an ancestor that called it, not
 * by calling it itself.
 *
 * This is a source-level guard because the failure is silent at runtime: an
 * extra call renders and dispatches fine, it just quietly stops honouring the
 * scene-wide invariants.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(process.cwd(), 'src');

const EXPECTED_CALL_SITES = ['lib/HUDTray/HUDTrayScene.svelte', 'lib/TableScene.svelte'];

function walk(dir: string): string[] {
	return readdirSync(dir).flatMap((entry) => {
		const path = join(dir, entry);
		return statSync(path).isDirectory() ? walk(path) : [path];
	});
}

describe('interactivity() call sites', () => {
	const callSites = walk(SRC)
		.filter((path) => path.endsWith('.svelte') || path.endsWith('.ts'))
		.filter((path) => !path.includes('__tests__'))
		// a bare `interactivity(` at the start of a statement — not the import,
		// and not the word inside a comment
		.filter((path) => /^\s*interactivity\(/m.test(readFileSync(path, 'utf8')))
		.map((path) => relative(SRC, path))
		.sort();

	it('is called exactly once per camera, and nowhere else', () => {
		expect(callSites).toEqual(EXPECTED_CALL_SITES);
	});
});
