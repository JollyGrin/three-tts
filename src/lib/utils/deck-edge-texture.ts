import * as THREE from 'three';
import { DECK_HEIGHT_PER_CARD } from './constants-cards';

/**
 * Procedural stacked-card-edge texture for deck sides: thin horizontal
 * stripes with per-line lightness jitter around the paper base color.
 * One shared canvas; each deck gets its own CanvasTexture clone so its
 * repeat.y can track that deck's height independently.
 */

/** Stripes drawn into one repeat of the canvas */
export const DECK_EDGE_STRIPES_PER_REPEAT = 64;

/** World-space thickness of one stripe — one stripe per card in the stack */
const STRIPE_WORLD_THICKNESS = DECK_HEIGHT_PER_CARD;

let sharedCanvas: HTMLCanvasElement | null = null;

function getStripeCanvas(): HTMLCanvasElement {
	if (sharedCanvas) return sharedCanvas;
	const stripePx = 2;
	const canvas = document.createElement('canvas');
	canvas.width = 4;
	canvas.height = DECK_EDGE_STRIPES_PER_REPEAT * stripePx;
	const ctx = canvas.getContext('2d')!;
	// base paper color (#e2dfd2 ≈ hsl(48, 22%, 85%))
	for (let i = 0; i < DECK_EDGE_STRIPES_PER_REPEAT; i++) {
		const lightness = 85 + (Math.random() * 14 - 9); // jitter, biased slightly dark
		ctx.fillStyle = `hsl(48, 22%, ${lightness}%)`;
		ctx.fillRect(0, i * stripePx, canvas.width, stripePx);
	}
	sharedCanvas = canvas;
	return canvas;
}

/** Create a deck-side texture. Browser only — call from component init. */
export function createDeckEdgeTexture(): THREE.CanvasTexture {
	const texture = new THREE.CanvasTexture(getStripeCanvas());
	texture.wrapS = THREE.RepeatWrapping;
	texture.wrapT = THREE.RepeatWrapping;
	texture.colorSpace = THREE.SRGBColorSpace;
	return texture;
}

/**
 * repeat.y that keeps stripes at constant world thickness (≈ one card edge)
 * regardless of deck height. The unit-height deck geometry maps v 0..1 over
 * the full side, so repeats = height / (stripes-per-repeat × stripe size).
 */
export function deckEdgeRepeatY(height: number): number {
	return height / (DECK_EDGE_STRIPES_PER_REPEAT * STRIPE_WORLD_THICKNESS);
}
