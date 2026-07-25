import { describe, expect, it } from 'vitest';
import { buildInviteUrl, pickInviteSeat } from '../invite';

describe('pickInviteSeat', () => {
	it('prefers the first open seat that is not mine', () => {
		expect(pickInviteSeat([0, 1], 0)).toBe(1);
		expect(pickInviteSeat([0, 1, 2], 1)).toBe(0);
	});

	it('falls back to any open seat when they are all mine', () => {
		expect(pickInviteSeat([1], 1)).toBe(1);
	});

	it('is undefined with no open seats', () => {
		expect(pickInviteSeat([], 0)).toBeUndefined();
	});
});

describe('buildInviteUrl', () => {
	it('produces an absolute URL carrying server, lobby, and seat', () => {
		const url = buildInviteUrl({
			origin: 'https://table.place',
			server: 'wss://sync.table.place',
			lobby: 'mossy-glade',
			seat: 1
		});
		expect(url).toBe(
			'https://table.place/play?server=wss%3A%2F%2Fsync.table.place&lobby=mossy-glade&seat=1'
		);
		// chat clients only linkify schemed URLs
		expect(new URL(url).origin).toBe('https://table.place');
	});

	it('omits seat when none is open', () => {
		const url = buildInviteUrl({
			origin: 'http://localhost:5173',
			server: 'ws://localhost:8080',
			lobby: 'dev',
			seat: undefined
		});
		expect(url).toBe('http://localhost:5173/play?server=ws%3A%2F%2Flocalhost%3A8080&lobby=dev');
		expect(url).not.toContain('seat=');
	});
});
