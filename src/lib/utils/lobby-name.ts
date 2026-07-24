/**
 * Human-readable lobby names — the slug in `/play?lobby=<slug>` *is* the invite
 * link, so it has to be easy to read out loud and easy to type. 50 x 50 words
 * is ~2500 combinations, plenty for a hobby app where collisions just mean two
 * strangers share a table.
 */

const ADJECTIVES = [
	'amber',
	'ancient',
	'bold',
	'brave',
	'brisk',
	'bronze',
	'calm',
	'clever',
	'copper',
	'crimson',
	'curious',
	'dapper',
	'dusty',
	'eager',
	'early',
	'fabled',
	'fancy',
	'feral',
	'fleet',
	'frosty',
	'gentle',
	'gilded',
	'golden',
	'happy',
	'hidden',
	'humble',
	'ivory',
	'jolly',
	'keen',
	'lucky',
	'merry',
	'mighty',
	'misty',
	'noble',
	'plucky',
	'polite',
	'proud',
	'quiet',
	'rapid',
	'rustic',
	'scarlet',
	'silent',
	'silver',
	'sleepy',
	'snowy',
	'swift',
	'tidy',
	'velvet',
	'wandering',
	'witty'
] as const;

const NOUNS = [
	'badger',
	'beacon',
	'bishop',
	'boulder',
	'canyon',
	'castle',
	'cedar',
	'chalice',
	'comet',
	'compass',
	'cove',
	'dagger',
	'delta',
	'ember',
	'falcon',
	'ferret',
	'garden',
	'gazelle',
	'harbor',
	'heron',
	'hollow',
	'ibis',
	'jackal',
	'kestrel',
	'lantern',
	'ledger',
	'lynx',
	'magpie',
	'marble',
	'meadow',
	'mongoose',
	'otter',
	'panther',
	'pebble',
	'pelican',
	'quarry',
	'raven',
	'ridge',
	'saffron',
	'sparrow',
	'stallion',
	'tavern',
	'thicket',
	'thistle',
	'tundra',
	'vulture',
	'walrus',
	'willow',
	'wombat',
	'zephyr'
] as const;

function pick<T>(words: readonly T[]): T {
	return words[Math.floor(Math.random() * words.length)];
}

/**
 * Roll a fresh lobby id, e.g. `swift-otter`. Always lowercase, hyphenated and
 * URL-safe: matches /^[a-z]+-[a-z]+$/.
 */
export function randomLobbyName(): string {
	return `${pick(ADJECTIVES)}-${pick(NOUNS)}`;
}
