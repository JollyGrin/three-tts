import { writable } from 'svelte/store';

/**
 * How strongly the image-based environment (HDR.svelte) lights every
 * Standard-material surface. Multiplies `scene.environmentIntensity`, so 0
 * disables the IBL contribution without unloading the texture.
 *
 * The default is tuned against the ACESFilmic tone mapping the Canvas forces
 * (see /play/+page.svelte): high enough that dice, tokens and bags pick up
 * reflections instead of reading as matte plastic, low enough that the felt
 * keeps its saturation instead of washing out.
 */
export const ENVIRONMENT_INTENSITY_DEFAULT = 0.35;

export const environmentIntensity = writable(ENVIRONMENT_INTENSITY_DEFAULT);
