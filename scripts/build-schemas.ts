/**
 * Generate JSON Schemas for the tbpp/tbps file formats from the TS types
 * (CONTENT_CREATION.md Layer 0). Output lands in static/ so the deployed
 * site serves them at the `$schema` URLs the exporters write.
 *
 *   bun run schemas
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as TJS from 'typescript-json-schema';

const root = resolve(import.meta.dirname, '..');

const settings: TJS.PartialArgs = {
	required: true,
	titles: true,
	aliasRef: false,
	topRef: false
};

const program = TJS.getProgramFromFiles(
	[resolve(root, 'src/lib/packs/file.ts'), resolve(root, 'src/lib/scenario/file.ts')],
	{ strictNullChecks: true, skipLibCheck: true, lib: ['es2022', 'dom'] },
	root
);

const generator = TJS.buildGenerator(program, settings);
if (!generator) throw new Error('schema generator failed to build — see TS errors above');

for (const [symbol, outFile, description] of [
	['PackFile', 'static/pack.schema.json', 'table.place pack (.tbpp.json) — see docs/packs.md'],
	[
		'ScenarioFile',
		'static/scenario.schema.json',
		'table.place scenario (.tbps.json) — see docs/packs.md'
	]
] as const) {
	const schema = generator.getSchemaForSymbol(symbol);
	schema.description = description;
	writeFileSync(resolve(root, outFile), JSON.stringify(schema, null, '\t') + '\n');
	console.log(`wrote ${outFile}`);
}
