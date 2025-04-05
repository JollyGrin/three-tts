export function wsWrapper(fn: Function) {
	return function passArgs(...args: any[]) {
		console.log({
			args
		});
		console.log('spread logs', ...args);
		return fn(...args);
	};
}
