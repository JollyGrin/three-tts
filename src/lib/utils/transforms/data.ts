/**
 * Removes all undefined values from an object
 *
 * Useful for passing state into store updates,
 * as undefined values will be ignored and maintain existing values
 * */
export function purgeUndefinedValues(obj: any) {
	return Object.fromEntries(
		Object.entries(obj).filter(([key, value]) => value !== undefined)
	);
}

/**
 * Translate [x,y,z] array into {x,y,z} object
 * Accepts an array or object and ensure an {x,y,z} object is returned
 * If undefined passed in, will return undefined
 *
 * Useful for transforming localstate to send websocket updates
 * */
export function convertVec3ArrayToRecord(
	vec3: [number, number, number] | Record<string, number> | undefined
) {
	if (vec3 === undefined) return undefined;

	let vec3Object;
	if (Array.isArray(vec3)) {
		// If position is an array [x, y, z], convert to object {x, y, z}
		vec3Object = {
			x: vec3[0],
			y: vec3[1],
			z: vec3[2]
		};
	} else if (typeof vec3 === 'object') {
		// Position is already an object, make sure it has x, y, z fields
		vec3Object = {
			x: vec3.x || 0,
			y: vec3.y || 0,
			z: vec3.z || 0
		};
	} else {
		// Fallback for any other case
		vec3Object = { x: 0, y: 0, z: 0 };
	}

	return vec3Object;
}
