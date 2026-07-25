/// <reference types="bun-types" />
/**
 * Gate the published contract in CI. Two failures are possible:
 *
 * 1. **Stale** — regenerating from the types produces different content than
 *    what is committed. Someone changed a type and did not run
 *    `bun run schemas`.
 * 2. **Unversioned change** — a schema's content changed relative to the base
 *    branch without `x-tableplace-spec-version` being bumped. A consumer
 *    pinned to a version would silently get different rules.
 *
 * Both comparisons strip `x-generated-at` and `x-tableplace-source-sha` first.
 * The timestamp changes on every run, and the sha *always* differs between the
 * committed value and a CI regeneration — the committed value is the tree the
 * schema was generated from, which is necessarily the parent of the commit
 * that introduced it. Comparing either would make this check fail constantly
 * and train everyone to ignore it.
 *
 *   bun scripts/check-schemas.ts [--base <ref>]
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildArtifacts, root, VOLATILE_KEYS } from './build-schemas';

/** Schemas carry a spec version; llms.txt is prose and is only drift-checked. */
const VERSIONED = ['static/pack.schema.json', 'static/scenario.schema.json'];

const VOLATILE_LINE = new RegExp(`"(${VOLATILE_KEYS.join('|')})"\\s*:`);

/**
 * Content with the volatile provenance lines removed. Line-based so it works
 * on the schemas and on llms.txt, which embeds them verbatim.
 */
function canonical(text: string): string {
	return text
		.split('\n')
		.filter((line) => !VOLATILE_LINE.test(line))
		.join('\n');
}

function specVersionOf(text: string): string | undefined {
	try {
		return JSON.parse(text)['x-tableplace-spec-version'];
	} catch {
		return undefined;
	}
}

/** File content at a git ref, or undefined if it did not exist there. */
function atRef(ref: string, path: string): string | undefined {
	try {
		return execFileSync('git', ['show', `${ref}:${path}`], {
			cwd: root,
			stdio: ['ignore', 'pipe', 'ignore']
		}).toString();
	} catch {
		return undefined;
	}
}

const baseFlag = process.argv.indexOf('--base');
const base = baseFlag === -1 ? undefined : process.argv[baseFlag + 1];

const errors: string[] = [];
const artifacts = await buildArtifacts();

// 1. stale check — regenerated vs committed
for (const { path, contents } of artifacts) {
	const committed = readFileSync(resolve(root, path), 'utf-8');
	if (canonical(committed) !== canonical(contents)) {
		errors.push(
			`${path} is stale — it does not match what the current types generate.\n` +
				`      Run \`bun run schemas\` and commit the result.`
		);
	}
}

// 2. version-bump check — committed vs base branch
if (!base) {
	console.log('no --base given, skipping the version-bump check');
} else if (!atRef(base, 'package.json')) {
	console.log(`base ref '${base}' is not available (shallow clone?), skipping version-bump check`);
} else {
	for (const path of VERSIONED) {
		const before = atRef(base, path);
		const after = readFileSync(resolve(root, path), 'utf-8');
		// a schema that did not exist on the base branch is a first publication
		if (before === undefined) continue;
		if (canonical(before) === canonical(after)) continue;

		const wasVersion = specVersionOf(before);
		const nowVersion = specVersionOf(after);
		if (wasVersion !== undefined && wasVersion === nowVersion) {
			errors.push(
				`${path} changed but x-tableplace-spec-version is still ${nowVersion}.\n` +
					`      Bump it in src/lib/formats/spec-version.ts: major for a breaking change\n` +
					`      (field removed, renamed, or made required), minor for an additive one.`
			);
		}
	}
}

if (errors.length) {
	for (const error of errors) console.error(`::error::${error}`);
	process.exit(1);
}
console.log(`published contract OK (${artifacts.length} artifacts checked)`);
