/** The dev bridge's shape, for the code that runs inside `page.evaluate`. */
import type { TestBridge } from '../src/lib/dev/test-bridge';

declare global {
	interface Window {
		__tableplace?: TestBridge;
	}
}

export {};
