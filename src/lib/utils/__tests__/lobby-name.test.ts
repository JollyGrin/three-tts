import { describe, it, expect } from 'vitest';
import { randomLobbyName } from '../lobby-name';

describe('randomLobbyName', () => {
	it('is lowercase, hyphenated and URL-safe', () => {
		for (let i = 0; i < 200; i++) {
			const name = randomLobbyName();
			expect(name).toMatch(/^[a-z]+-[a-z]+$/);
			expect(encodeURIComponent(name)).toBe(name);
		}
	});

	it('rolls more than one distinct value', () => {
		const names = new Set(Array.from({ length: 100 }, () => randomLobbyName()));
		expect(names.size).toBeGreaterThan(1);
	});
});
