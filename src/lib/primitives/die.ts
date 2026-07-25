/**
 * Procedural dice — geometry, face numbering and the numbered-face texture,
 * built from three.js primitives with zero external assets (SPEC.md §2).
 *
 * d4 tetrahedron, d6 box, d8 octahedron, d12 dodecahedron, d20 icosahedron all
 * come from three.js built-ins; the d10 is a pentagonal trapezohedron built
 * here, since three.js has no such primitive.
 *
 * One pipeline handles every shape: take the raw triangles, cluster them into
 * flat polygonal faces by normal, number the faces, then give each face a UV
 * mapping onto its own cell of a generated number atlas. Grouping by normal
 * rather than by three.js's own triangulation is what makes the d12 (each
 * pentagon is three triangles) and the d10 (each kite is two) work without
 * special cases.
 *
 * Everything here is deterministic and DOM-free apart from `dieTexture`, so
 * two clients build byte-identical dice and the geometry is unit-testable.
 */

import * as THREE from 'three';
import type { DieSides } from '$lib/store/game/types';

/** two normals closer than this count as the same face */
const COPLANAR_DOT = 0.9995;

/** fraction of an atlas cell a face's circumcircle is mapped onto */
const CELL_FIT = 0.94;

/** atlas cell resolution in px */
const CELL_PX = 128;

/**
 * How far out a d4's corner numbers sit, as a fraction of the way from the
 * face centre to a corner. Any further and the glyph's top edge crosses out of
 * the narrowing wedge near the vertex and gets clipped by the geometry.
 */
const D4_LABEL_RADIUS = 0.58;

/**
 * Bounding box of one digit of the sans-serif face we draw with, in ems.
 * Deliberately generous: the exact metrics depend on which font the browser
 * actually resolves, and a number that overhangs its face is clipped by the
 * triangle it sits on rather than merely spilling over.
 */
const GLYPH_WIDTH_EM = 0.58;
const GLYPH_HEIGHT_EM = 0.74;

/**
 * Shrink the fitted glyph this much. Partly clearance from the face's edge,
 * partly taste: at 1.0 a d6 wears a numeral the full height of its face.
 */
const GLYPH_MARGIN = 0.72;

/** the d4's corner numbers are placed, not fitted — see `d4Model` */
const D4_FONT_SCALE = 0.22;

export type DieFaceLabel = {
	text: string;
	/** cell-local position, -1…1, +y up */
	x: number;
	y: number;
};

export type DieModel = {
	/** circumradius 1, flat-shaded, UV-mapped onto the number atlas */
	geometry: THREE.BufferGeometry;
	/** `upDirs[value - 1]` is the direction that points +Y when the die reads `value` */
	upDirs: THREE.Vector3[];
	/** distance from the die's centre to the table when it is settled, at radius 1 */
	restOffset: number;
	/** number-atlas layout; `cells[value - 1]` is what that face shows */
	atlas: {
		cols: number;
		rows: number;
		cells: DieFaceLabel[][];
		/** glyph size as a fraction of a cell */
		fontScale: number;
		/**
		 * How much of the cell the face's circumcircle covers — the scale factor
		 * between a label's -1…1 coordinates and the cell. Published so the
		 * atlas describes its own coordinate system.
		 */
		fit: number;
	};
};

/* -------------------------------------------------------------------------- */
/* shapes                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Pentagonal trapezohedron — the d10. Two apexes plus two rings of five,
 * offset by 36°, giving ten kite faces.
 *
 * The apex height is not free: a kite is only planar when
 * `h = t·(2sin36 + sin72) / (2sin36 - sin72)`, which falls out of requiring
 * the four corners of one face to be coplanar. Getting this wrong produces a
 * shape that still renders but whose "faces" are creased, so the numbers sit
 * on a fold.
 */
function trapezohedron(): number[] {
	const s36 = Math.sin(Math.PI / 5);
	const s72 = Math.sin((2 * Math.PI) / 5);
	/** half the height of the zigzag equator */
	const t = 0.105;
	const h = (t * (2 * s36 + s72)) / (2 * s36 - s72);

	const ring = (index: number, offset: number, y: number) => {
		const theta = ((2 * Math.PI) / 5) * index + offset;
		return new THREE.Vector3(Math.cos(theta), y, Math.sin(theta));
	};
	const top = new THREE.Vector3(0, h, 0);
	const bottom = new THREE.Vector3(0, -h, 0);
	const upper = [0, 1, 2, 3, 4].map((i) => ring(i, 0, t));
	const lower = [0, 1, 2, 3, 4].map((i) => ring(i, Math.PI / 5, -t));

	const quads: THREE.Vector3[][] = [];
	for (let i = 0; i < 5; i++) {
		const next = (i + 1) % 5;
		quads.push([top, upper[i], lower[i], upper[next]]);
		quads.push([bottom, lower[i], upper[next], lower[next]]);
	}

	const positions: number[] = [];
	for (const quad of quads) {
		pushTriangle(positions, quad[0], quad[1], quad[2]);
		pushTriangle(positions, quad[0], quad[2], quad[3]);
	}
	return positions;
}

/** Regular tetrahedron whose vertex *order* is meaningful — see `d4Model`. */
const TETRA_VERTICES = [
	new THREE.Vector3(1, 1, 1),
	new THREE.Vector3(1, -1, -1),
	new THREE.Vector3(-1, 1, -1),
	new THREE.Vector3(-1, -1, 1)
].map((v) => v.normalize());

/** Face `i` of the tetrahedron is the one opposite vertex `i`. */
const TETRA_FACES = [
	[1, 2, 3],
	[0, 3, 2],
	[0, 1, 3],
	[0, 2, 1]
];

/** append a triangle wound so its normal points away from the origin */
function pushTriangle(out: number[], a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) {
	const normal = new THREE.Vector3()
		.subVectors(b, a)
		.cross(new THREE.Vector3().subVectors(c, a))
		.normalize();
	const outward = new THREE.Vector3().add(a).add(b).add(c);
	const [p, q, r] = normal.dot(outward) < 0 ? [a, c, b] : [a, b, c];
	out.push(p.x, p.y, p.z, q.x, q.y, q.z, r.x, r.y, r.z);
}

/** Raw triangle soup per shape, normalised to circumradius 1. */
function trianglePositions(sides: DieSides): number[] {
	if (sides === 10) return normalise(trapezohedron());
	if (sides === 4) {
		const out: number[] = [];
		for (const [a, b, c] of TETRA_FACES) {
			pushTriangle(out, TETRA_VERTICES[a], TETRA_VERTICES[b], TETRA_VERTICES[c]);
		}
		return out;
	}
	const source =
		sides === 6
			? new THREE.BoxGeometry(1, 1, 1).toNonIndexed()
			: sides === 8
				? new THREE.OctahedronGeometry(1)
				: sides === 12
					? new THREE.DodecahedronGeometry(1)
					: new THREE.IcosahedronGeometry(1);
	const positions = Array.from(source.getAttribute('position').array as ArrayLike<number>);
	source.dispose();
	return normalise(positions);
}

/** scale so the farthest corner sits at radius 1, whatever the source shape */
function normalise(positions: number[]): number[] {
	let max = 0;
	for (let i = 0; i < positions.length; i += 3) {
		max = Math.max(max, Math.hypot(positions[i], positions[i + 1], positions[i + 2]));
	}
	return max > 0 ? positions.map((v) => v / max) : positions;
}

/* -------------------------------------------------------------------------- */
/* faces                                                                      */
/* -------------------------------------------------------------------------- */

type Face = {
	normal: THREE.Vector3;
	/** index of the first vertex of each triangle in this face */
	triangles: number[];
	centroid: THREE.Vector3;
	/** greatest distance from the centroid to a corner */
	circumradius: number;
};

/**
 * Cluster the triangle soup into flat faces. Compared pairwise against the
 * clusters found so far rather than hashed on a rounded normal: 60 triangles
 * is nothing, and a hash would split a face whose two triangles happen to
 * round either side of a bucket edge.
 */
function clusterFaces(positions: number[]): Face[] {
	const vertex = (i: number) =>
		new THREE.Vector3(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
	const faces: Face[] = [];

	for (let t = 0; t < positions.length / 9; t++) {
		const [a, b, c] = [vertex(t * 3), vertex(t * 3 + 1), vertex(t * 3 + 2)];
		const normal = new THREE.Vector3()
			.subVectors(b, a)
			.cross(new THREE.Vector3().subVectors(c, a))
			.normalize();
		const face = faces.find((f) => f.normal.dot(normal) > COPLANAR_DOT);
		if (face) face.triangles.push(t * 3);
		else {
			faces.push({
				normal,
				triangles: [t * 3],
				centroid: new THREE.Vector3(),
				circumradius: 0
			});
		}
	}

	for (const face of faces) {
		const corners = face.triangles.flatMap((i) => [vertex(i), vertex(i + 1), vertex(i + 2)]);
		for (const corner of corners) face.centroid.add(corner);
		face.centroid.divideScalar(corners.length);
		for (const corner of corners) {
			face.circumradius = Math.max(face.circumradius, corner.distanceTo(face.centroid));
		}
	}
	return faces;
}

/**
 * Number the faces the way a real die is numbered: opposite faces sum to
 * `sides + 1`. Every shape here except the tetrahedron is centrally symmetric,
 * so each face has an antipode to pair with; the d4 has none and just counts
 * up in geometry order.
 */
function numberFaces(faces: Face[], sides: number): number[] {
	const values = new Array<number>(faces.length).fill(0);
	let next = 1;
	for (let i = 0; i < faces.length; i++) {
		if (values[i]) continue;
		values[i] = next;
		const opposite = faces.findIndex(
			(f, j) => j !== i && !values[j] && f.normal.dot(faces[i].normal) < -COPLANAR_DOT
		);
		if (opposite >= 0) values[opposite] = sides + 1 - next;
		next++;
	}
	return values;
}

/* -------------------------------------------------------------------------- */
/* atlas mapping                                                              */
/* -------------------------------------------------------------------------- */

function atlasGrid(sides: number) {
	const cols = Math.ceil(Math.sqrt(sides));
	return { cols, rows: Math.ceil(sides / cols) };
}

/** cell-local (-1…1, +y up) → uv, for the cell holding `value` */
function cellUv(value: number, cols: number, rows: number, x: number, y: number): [number, number] {
	const col = (value - 1) % cols;
	const row = Math.floor((value - 1) / cols);
	const u = (col + 0.5 + (x * CELL_FIT) / 2) / cols;
	// canvas rows run top-down, uv runs bottom-up
	const v = 1 - (row + 0.5 - (y * CELL_FIT) / 2) / rows;
	return [u, v];
}

/**
 * A face's own frame. `(u, v, normal)` is right-handed, so viewed from outside
 * the die `u` runs right and `v` runs up. Which way round the face `u` happens
 * to point does not matter: a die settles by pointing a direction at the
 * ceiling, which leaves its yaw free, so the number arrives at the camera at an
 * arbitrary angle no matter what we do here. What matters is only that the
 * number *fits* — see `largestFit`.
 */
function faceFrame(face: Face, theta: number) {
	const reference =
		Math.abs(face.normal.y) > 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
	const u = new THREE.Vector3().crossVectors(reference, face.normal).normalize();
	const v = new THREE.Vector3().crossVectors(face.normal, u);
	if (!theta) return { u, v };
	// spin the frame in-plane so the text runs the way `largestFit` chose
	const cos = Math.cos(theta);
	const sin = Math.sin(theta);
	return {
		u: u.clone().multiplyScalar(cos).addScaledVector(v, sin),
		v: u.clone().multiplyScalar(-sin).addScaledVector(v, cos)
	};
}

/** the face's corners in its own frame, scaled to circumradius 1 and ordered round it */
function faceOutline(face: Face, positions: number[]): [number, number][] {
	const { u, v } = faceFrame(face, 0);
	const corners: [number, number][] = [];
	for (const first of face.triangles) {
		for (let k = 0; k < 3; k++) {
			const i = (first + k) * 3;
			const local = new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]).sub(
				face.centroid
			);
			const point: [number, number] = [
				local.dot(u) / face.circumradius,
				local.dot(v) / face.circumradius
			];
			if (!corners.some((c) => Math.hypot(c[0] - point[0], c[1] - point[1]) < 1e-6)) {
				corners.push(point);
			}
		}
	}
	return corners.sort((a, b) => Math.atan2(a[1], a[0]) - Math.atan2(b[1], b[0]));
}

/**
 * The biggest a label of the given shape can be drawn on this face, and the
 * angle that achieves it.
 *
 * This is what replaces a hand-tuned size-per-shape table, and it is not
 * fussiness: a d10's face is a kite, and the arbitrary frame `faceFrame` starts
 * from lands the two digits of "10" across the kite's *narrow* axis on some
 * faces and its wide axis on others. A number that overhangs its face is not
 * drawn small — it is clipped by the triangle it sits on, so the die reads "1".
 *
 * Candidate angles are the edge directions (the optimum for a square or a kite
 * is always parallel to an edge) plus a coarse sweep to cover shapes where it
 * is not.
 */
function largestFit(
	corners: [number, number][],
	halfWidth: number,
	halfHeight: number
): { theta: number; em: number } {
	// inward normal and centroid distance per edge — the centroid is the origin
	const edges = corners.map((corner, i) => {
		const next = corners[(i + 1) % corners.length];
		const length = Math.hypot(next[0] - corner[0], next[1] - corner[1]) || 1;
		let nx = -(next[1] - corner[1]) / length;
		let ny = (next[0] - corner[0]) / length;
		let d = -(nx * corner[0] + ny * corner[1]);
		if (d < 0) {
			nx = -nx;
			ny = -ny;
			d = -d;
		}
		return { nx, ny, d };
	});

	const candidates = corners.map((corner, i) => {
		const next = corners[(i + 1) % corners.length];
		return Math.atan2(next[1] - corner[1], next[0] - corner[0]);
	});
	for (let degrees = 0; degrees < 180; degrees += 3) candidates.push((degrees * Math.PI) / 180);

	let best = { theta: 0, em: 0 };
	for (const theta of candidates) {
		const cos = Math.cos(theta);
		const sin = Math.sin(theta);
		let em = Infinity;
		for (const edge of edges) {
			// the box grows linearly with the font size, so the limit per edge is
			// its clearance over the furthest-reaching corner of a 1em box
			let reach = 0;
			for (const sx of [-1, 1]) {
				for (const sy of [-1, 1]) {
					const dx = sx * halfWidth;
					const dy = sy * halfHeight;
					reach = Math.max(
						reach,
						(dx * cos - dy * sin) * edge.nx + (dx * sin + dy * cos) * edge.ny
					);
				}
			}
			if (reach > 1e-9) em = Math.min(em, edge.d / reach);
		}
		if (em > best.em) best = { theta, em };
	}
	return best;
}

/* -------------------------------------------------------------------------- */
/* models                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A d4 is read at its *top vertex*, not its top face: it lands flat on a face
 * and the number you want is the one printed at the apex of the three faces
 * you can see. So each face carries three numbers, one per corner, and the
 * corner belonging to vertex `i` shows `i + 1` — the value of the face
 * opposite that vertex. That makes every face agree about which number the
 * raised vertex means, which is exactly the real-world convention.
 *
 * Because corner *identity* matters, the d4's UVs map its vertices onto fixed
 * cell corners instead of going through the generic projection.
 */
function d4Model(): DieModel {
	const positions = trianglePositions(4);
	const { cols, rows } = atlasGrid(4);
	/** unit directions to the three corner slots, at 90° / 210° / 330° */
	const slots = [0, 1, 2].map((k) => {
		const theta = Math.PI / 2 + (k * 2 * Math.PI) / 3;
		return { x: Math.cos(theta), y: Math.sin(theta) };
	});

	const uvs: number[] = [];
	const cells: DieFaceLabel[][] = [];
	for (let f = 0; f < TETRA_FACES.length; f++) {
		const value = f + 1;
		// pushTriangle may have flipped the winding to point the normal
		// outward, so recover which vertex each corner actually is
		const corners = [0, 1, 2].map((k) => {
			const i = (f * 3 + k) * 3;
			const p = new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]);
			return TETRA_VERTICES.findIndex((v) => v.distanceTo(p) < 1e-6);
		});
		// corner k carries the value of the face opposite the vertex sitting there
		cells[value - 1] = corners.map((vertexIndex, k) => ({
			text: String(vertexIndex + 1),
			x: slots[k].x * D4_LABEL_RADIUS,
			y: slots[k].y * D4_LABEL_RADIUS
		}));
		for (let k = 0; k < 3; k++) {
			const [u, v] = cellUv(value, cols, rows, slots[k].x, slots[k].y);
			uvs.push(u, v);
		}
	}

	return {
		geometry: buildGeometry(positions, uvs),
		// vertex `i` up means the face opposite it — value i + 1 — is the result
		upDirs: TETRA_VERTICES.map((v) => v.clone()),
		restOffset: lowestPoint(positions, TETRA_VERTICES[0]),
		atlas: { cols, rows, cells, fontScale: D4_FONT_SCALE, fit: CELL_FIT }
	};
}

function polyhedronModel(sides: DieSides): DieModel {
	const positions = trianglePositions(sides);
	const faces = clusterFaces(positions);
	const values = numberFaces(faces, sides);
	const { cols, rows } = atlasGrid(sides);

	const uvs = new Array<number>((positions.length / 3) * 2);
	const upDirs = new Array<THREE.Vector3>(sides);
	const cells: DieFaceLabel[][] = [];

	// Size every face's number the same, off whichever face can afford the
	// least — a d20 whose "9" was twice the size of its "17" would look broken.
	const fits = faces.map((face, index) => {
		const text = String(values[index]);
		return largestFit(
			faceOutline(face, positions),
			(GLYPH_WIDTH_EM * text.length) / 2,
			GLYPH_HEIGHT_EM / 2
		);
	});
	const em = Math.min(...fits.map((fit) => fit.em)) * GLYPH_MARGIN;

	faces.forEach((face, index) => {
		const value = values[index];
		upDirs[value - 1] = face.normal.clone();
		cells[value - 1] = [{ text: String(value), x: 0, y: 0 }];

		const { u, v } = faceFrame(face, fits[index].theta);
		for (const first of face.triangles) {
			for (let k = 0; k < 3; k++) {
				const i = (first + k) * 3;
				const local = new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]).sub(
					face.centroid
				);
				const [su, sv] = cellUv(
					value,
					cols,
					rows,
					local.dot(u) / face.circumradius,
					local.dot(v) / face.circumradius
				);
				uvs[(first + k) * 2] = su;
				uvs[(first + k) * 2 + 1] = sv;
			}
		}
	});

	return {
		geometry: buildGeometry(positions, uvs),
		upDirs,
		restOffset: lowestPoint(positions, upDirs[0]),
		// em is measured in the -1…1 face frame, which covers `CELL_FIT` of a cell
		atlas: { cols, rows, cells, fontScale: (em * CELL_FIT) / 2, fit: CELL_FIT }
	};
}

/** how far below the centre the die's lowest point sits when `up` faces +Y */
function lowestPoint(positions: number[], up: THREE.Vector3): number {
	let depth = 0;
	for (let i = 0; i < positions.length; i += 3) {
		depth = Math.max(
			depth,
			-(positions[i] * up.x + positions[i + 1] * up.y + positions[i + 2] * up.z)
		);
	}
	return depth;
}

function buildGeometry(positions: number[], uvs: number[]): THREE.BufferGeometry {
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
	geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
	geometry.computeVertexNormals();
	return geometry;
}

const modelCache = new Map<DieSides, DieModel>();

/** Geometry + numbering for a die, built once per shape and shared. */
export function dieModel(sides: DieSides): DieModel {
	let model = modelCache.get(sides);
	if (!model) {
		model = sides === 4 ? d4Model() : polyhedronModel(sides);
		modelCache.set(sides, model);
	}
	return model;
}

/** The orientation a die of `sides` rests in when it reads `value`. */
export function dieSettleQuaternion(sides: DieSides, value: number): THREE.Quaternion {
	const { upDirs } = dieModel(sides);
	const up = upDirs[Math.min(Math.max(value, 1), sides) - 1] ?? new THREE.Vector3(0, 1, 0);
	return new THREE.Quaternion().setFromUnitVectors(up, new THREE.Vector3(0, 1, 0));
}

/** Centre height of a settled die of the given footprint radius, above the table. */
export function dieRestOffset(sides: DieSides, radius: number): number {
	return dieModel(sides).restOffset * radius;
}

/* -------------------------------------------------------------------------- */
/* texture                                                                    */
/* -------------------------------------------------------------------------- */

/** dark ink on light dice, light ink on dark ones */
function inkFor(color: string): string {
	const hex = color.replace('#', '');
	if (hex.length !== 6) return '#1b1b1f';
	const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
	return 0.299 * r + 0.587 * g + 0.114 * b > 0.55 ? '#1b1b1f' : '#f6f4ee';
}

const textureCache = new Map<string, THREE.CanvasTexture | null>();

/**
 * The numbered-face atlas: one cell per value, drawn with our own font. Cells
 * are filled edge to edge with the die's body colour, so the small amount of
 * bleed a face's circumcircle can pick up from its neighbours is the same
 * colour it already is — only the glyphs would show, and they sit well inside.
 *
 * Returns null where there is no canvas (SSR, jsdom); callers fall back to a
 * plain coloured die.
 */
export function dieTexture(sides: DieSides, color: string): THREE.CanvasTexture | null {
	const key = `${sides}:${color}`;
	if (textureCache.has(key)) return textureCache.get(key) ?? null;

	const { cols, rows, cells, fontScale, fit } = dieModel(sides).atlas;
	const canvas = typeof document === 'undefined' ? null : document.createElement('canvas');
	const context = canvas?.getContext('2d') ?? null;
	if (!canvas || !context) {
		textureCache.set(key, null);
		return null;
	}

	canvas.width = cols * CELL_PX;
	canvas.height = rows * CELL_PX;
	context.fillStyle = color;
	context.fillRect(0, 0, canvas.width, canvas.height);

	context.fillStyle = inkFor(color);
	context.textAlign = 'center';
	context.textBaseline = 'middle';
	const font = Math.round(CELL_PX * fontScale);
	context.font = `600 ${font}px "Helvetica Neue", Helvetica, Arial, sans-serif`;

	cells.forEach((labels, index) => {
		const cx = ((index % cols) + 0.5) * CELL_PX;
		const cy = (Math.floor(index / cols) + 0.5) * CELL_PX;
		for (const label of labels) {
			const x = cx + (label.x * CELL_PX * fit) / 2;
			const y = cy - (label.y * CELL_PX * fit) / 2;
			context.fillText(label.text, x, y);
			// 6 and 9 are the same glyph upside down — underline both, as dice do
			if (label.text === '6' || label.text === '9') {
				const half = context.measureText(label.text).width / 2;
				context.fillRect(x - half, y + font * 0.42, half * 2, Math.max(2, font * 0.08));
			}
		}
	});

	const texture: THREE.CanvasTexture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	// no mips: a face's circumcircle sits right up against the cell edge, and
	// coarse mip levels would smear a neighbouring cell's glyph into it
	texture.generateMipmaps = false;
	texture.minFilter = THREE.LinearFilter;
	texture.magFilter = THREE.LinearFilter;
	textureCache.set(key, texture);
	return texture;
}

const materialCache = new Map<string, THREE.MeshStandardMaterial>();

/**
 * One shared material per shape+colour. Shared rather than per-instance
 * because the numbers are baked into the texture, so two dice of the same
 * colour are genuinely identical — and because a shared material is attached
 * with `dispose={false}`, which is what stops one die leaving the table from
 * disposing the texture every other die is still drawing with.
 */
export function dieMaterial(sides: DieSides, color: string): THREE.MeshStandardMaterial {
	const key = `${sides}:${color}`;
	let material = materialCache.get(key);
	if (!material) {
		const map = dieTexture(sides, color);
		material = new THREE.MeshStandardMaterial({
			map,
			// the atlas already carries the body colour; tinting it again would double it
			color: map ? '#ffffff' : color,
			roughness: 0.42,
			metalness: 0.02,
			// crisp facet edges — a die should read as cut, not moulded
			flatShading: true
		});
		materialCache.set(key, material);
	}
	return material;
}
