/**
 * The `model:` scheme through the /create ref editor (tableplace-135): the
 * fourth scheme parses into kit/name fields, builds back byte-identical, and
 * degrades to the raw-string case instead of eating a malformed ref.
 */
import { describe, expect, it } from 'vitest';
import { buildFaceRef, parseFaceRef, FACE_SCHEME_OPTIONS } from '../face-ref';

describe('model: refs in the face-ref editor', () => {
	it('is offered as a scheme', () => {
		expect(Object.values(FACE_SCHEME_OPTIONS)).toContain('model');
	});

	it('parses into kit and name fields', () => {
		const draft = parseFaceRef('model:kenney-cave/room-large');
		expect(draft.scheme).toBe('model');
		expect(draft.modelKit).toBe('kenney-cave');
		expect(draft.modelName).toBe('room-large');
	});

	it('round-trips unchanged', () => {
		const ref = 'model:kenney-cave/corridor-wide-corner';
		expect(buildFaceRef(parseFaceRef(ref))).toBe(ref);
	});

	it('keeps a malformed model ref as a raw string rather than blanking it', () => {
		const draft = parseFaceRef('model:no-slash-here');
		expect(draft.scheme).toBe('url');
		expect(draft.url).toBe('model:no-slash-here');
		expect(buildFaceRef(draft)).toBe('model:no-slash-here');
	});

	it('builds the empty ref until both halves are filled', () => {
		const draft = parseFaceRef('');
		draft.scheme = 'model';
		draft.modelKit = 'kenney-cave';
		draft.modelName = '';
		expect(buildFaceRef(draft)).toBe('');
		draft.modelName = 'gate';
		expect(buildFaceRef(draft)).toBe('model:kenney-cave/gate');
	});
});
