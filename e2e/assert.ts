/** The three assertions the specs actually need. */

export function ok(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message);
}

export function equal<T>(actual: T, expected: T, message: string): void {
	if (actual !== expected) throw new Error(`${message} — expected ${expected}, got ${actual}`);
}

/** distance between two [x, y, z] store positions, ignoring height */
export function planarDistance(a: number[] | null, b: number[] | null): number {
	if (!a || !b) return 0;
	return Math.hypot((a[0] ?? 0) - (b[0] ?? 0), (a[2] ?? 0) - (b[2] ?? 0));
}
