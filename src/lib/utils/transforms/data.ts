/**
 * Removes all undefined values from an object
 *
 * Useful for passing state into store updates,
 * as undefined values will be ignored and maintain existing values
 * */
export function purgeUndefinedValues(obj: any) {
	console.log('xxxxxx', obj, Object.keys(obj));
	if (Object.keys(obj).length === 0) return null;
	if (
		Object.values(obj).every((value) => value === undefined || value === null)
	)
		return null;

	return Object.fromEntries(
		Object.entries(obj).filter(([_key, value]) => value !== undefined)
	);
}
