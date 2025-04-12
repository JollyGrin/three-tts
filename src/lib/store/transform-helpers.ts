/**
 * Takes two objects and returns a new object with the values of the second merged into the first
 * */
export function merge(a: any, b: any): any {
	if (Array.isArray(a) || Array.isArray(b)) {
		return b;
	}
	if (typeof a !== 'object' || typeof b !== 'object') {
		return b;
	}

	const merged: Record<string, any> = {};
	Object.keys(a).forEach((key) => {
		merged[key] = a[key];
	});

	Object.keys(b).forEach((key) => {
		const old = a[key];
		if (old) {
			merged[key] = merge(old, b[key]);
		} else {
			merged[key] = b[key];
		}
	});

	return merged;
}
