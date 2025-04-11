/**
 * Removes all undefined values from an object
 *
 * Useful for passing state into store updates,
 * as undefined values will be ignored and maintain existing values
 * */
export function purgeUndefinedValues(obj: any) {
	return Object.fromEntries(
		Object.entries(obj).filter(([_key, value]) => value !== undefined)
	);
}