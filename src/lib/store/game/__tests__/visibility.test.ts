import { describe, expect, it } from 'vitest';
import { canSeeFace, faceFor, isHeldByOther, visibilityOf } from '../visibility';

describe('visibilityOf', () => {
	it('reads an explicit descriptor', () => {
		expect(visibilityOf({ visibility: { kind: 'public' } })).toEqual({ kind: 'public' });
		expect(visibilityOf({ visibility: { kind: 'hidden', seenBy: ['a'] } })).toEqual({
			kind: 'hidden',
			seenBy: ['a']
		});
	});

	it('falls back to orientation, hiding anything facedown', () => {
		expect(visibilityOf({ rotation: [180, 0, 0] })).toEqual({ kind: 'hidden' });
		expect(visibilityOf({ rotation: [0, 0, 0] })).toEqual({ kind: 'public' });
		expect(visibilityOf(undefined)).toEqual({ kind: 'public' });
	});

	it('trusts the descriptor over the rotation', () => {
		// a peeked card lies facedown on the table but is not hidden from you
		const peeked = {
			rotation: [180, 0, 0] as [number, number, number],
			visibility: { kind: 'hidden' as const, seenBy: ['me'] }
		};
		expect(canSeeFace(peeked, 'me')).toBe(true);
		expect(canSeeFace(peeked, 'them')).toBe(false);

		// and a face-up card is public whatever its rotation says
		expect(canSeeFace({ rotation: [180, 0, 0], visibility: { kind: 'public' } }, 'them')).toBe(
			true
		);
	});
});

describe('faceFor', () => {
	it('returns nothing for a card this player may not see', () => {
		const hidden = { faceImageUrl: 'leftover.png', visibility: { kind: 'hidden' as const } };
		expect(faceFor(hidden, 'me')).toBeUndefined();
	});

	it('returns the face once you are entitled to it', () => {
		expect(faceFor({ faceImageUrl: 'ace.png', visibility: { kind: 'public' } }, 'me')).toBe(
			'ace.png'
		);
		expect(
			faceFor({ faceImageUrl: 'ace.png', visibility: { kind: 'hidden', seenBy: ['me'] } }, 'me')
		).toBe('ace.png');
	});

	it('has nothing to return when the server withheld the url', () => {
		expect(faceFor({ visibility: { kind: 'hidden' } }, 'me')).toBeUndefined();
	});
});

describe('isHeldByOther', () => {
	it('is true only while somebody else holds the lease', () => {
		expect(isHeldByOther({ heldBy: 'them' }, 'me')).toBe(true);
		expect(isHeldByOther({ heldBy: 'me' }, 'me')).toBe(false);
		expect(isHeldByOther({}, 'me')).toBe(false);
	});
});
