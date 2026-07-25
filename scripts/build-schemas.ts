/// <reference types="bun-types" />
/**
 * Generate the published authoring contract for the tbpp/tbps file formats
 * (CONTENT_CREATION.md Layer 0) from the TypeScript types themselves:
 *
 *   static/pack.schema.json      JSON Schema for `.tbpp.json`
 *   static/scenario.schema.json  JSON Schema for `.tbps.json`
 *   static/llms.txt              one self-contained doc, both schemas inlined
 *
 * Everything here is derived — schemas from the types, constants from
 * `constants-*.ts`, examples from `src/lib/formats/examples.ts` — so the
 * published contract cannot drift from the code that implements it.
 *
 *   bun run schemas
 *
 * Regeneration runs as part of `bun run build`, and
 * `src/lib/formats/__tests__/contract.test.ts` fails if the checked-in files
 * differ from a fresh build.
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import * as TJS from 'typescript-json-schema';
import { format, resolveConfig } from 'prettier';
import { renderLlmsTxt } from './llms-txt';
import { PACK_SPEC_VERSION, SCENARIO_SPEC_VERSION } from '../src/lib/formats/spec-version';

export const root = resolve(import.meta.dirname, '..');

/**
 * Keys whose value changes on every regeneration regardless of content. The
 * drift check strips them before comparing — see scripts/check-schemas.ts.
 */
export const VOLATILE_KEYS = ['x-generated-at', 'x-tableplace-source-sha'] as const;

/**
 * HEAD at generation time, with `-dirty` when the tree has uncommitted
 * changes. This is the tree the schema was generated FROM; it can never be
 * the commit that introduces the schema, since a file cannot contain the hash
 * of the commit that adds it.
 */
function sourceSha(): string {
	try {
		const git = (args: string[]) => execFileSync('git', args, { cwd: root }).toString().trim();
		const sha = git(['rev-parse', 'HEAD']);
		const dirty = git(['status', '--porcelain']).length > 0;
		return dirty ? `${sha}-dirty` : sha;
	} catch {
		return 'unknown';
	}
}

const settings: TJS.PartialArgs = {
	required: true,
	titles: true,
	aliasRef: false,
	topRef: false
};

export type Artifact = { path: string; contents: string };

function generateSchemas(): { pack: object; scenario: object } {
	const program = TJS.getProgramFromFiles(
		[resolve(root, 'src/lib/packs/file.ts'), resolve(root, 'src/lib/scenario/file.ts')],
		{ strictNullChecks: true, skipLibCheck: true, lib: ['es2022', 'dom'] },
		root
	);

	const generator = TJS.buildGenerator(program, settings);
	if (!generator) throw new Error('schema generator failed to build — see TS errors above');

	// provenance, identical in shape for both schemas
	const stamp = { generatedAt: new Date().toISOString(), sha: sourceSha() };
	const provenance = (specVersion: string) => ({
		'x-tableplace-spec-version': specVersion,
		'x-generated-at': stamp.generatedAt,
		'x-tableplace-source-sha': stamp.sha
	});

	const pack = generator.getSchemaForSymbol('PackFile');
	pack.description = 'table.place pack (.tbpp.json) — see docs/packs.md and llms.txt';
	Object.assign(pack, provenance(PACK_SPEC_VERSION));

	const scenario = generator.getSchemaForSymbol('ScenarioFile');
	scenario.description =
		'table.place scenario (.tbps.json) — UNSTABLE, generated from the live types, ' +
		'no compatibility promise. See docs/packs.md and llms.txt.';
	Object.assign(scenario, provenance(SCENARIO_SPEC_VERSION));

	return { pack, scenario };
}

/**
 * Build every published artifact in memory. Output is prettier-formatted so
 * regeneration is idempotent and `prettier --check` stays happy — otherwise
 * wiring generation into the build would churn the diff on every run.
 */
export async function buildArtifacts(): Promise<Artifact[]> {
	const { pack, scenario } = generateSchemas();
	// resolve .prettierrc rather than passing options inline: the generated
	// files sit in the repo and must satisfy the same `prettier --check .`
	// that gates lint.
	const prettierConfig = await resolveConfig(resolve(root, 'static/pack.schema.json'));
	// stringify expanded before formatting: prettier keeps an object multi-line
	// if it was already multi-line, so this preserves the readable one-key-per-
	// line shape instead of collapsing every short object onto one line.
	const json = (value: object) =>
		format(JSON.stringify(value, null, '\t'), { ...prettierConfig, parser: 'json' });

	const [packJson, scenarioJson] = await Promise.all([json(pack), json(scenario)]);

	return [
		{ path: 'static/pack.schema.json', contents: packJson },
		{ path: 'static/scenario.schema.json', contents: scenarioJson },
		{ path: 'static/llms.txt', contents: renderLlmsTxt(packJson, scenarioJson) }
	];
}

if (import.meta.main) {
	for (const { path, contents } of await buildArtifacts()) {
		writeFileSync(resolve(root, path), contents);
		console.log(`wrote ${path}`);
	}
}
