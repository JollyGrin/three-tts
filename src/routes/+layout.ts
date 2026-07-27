// Build-time SSR: the prerenderer renders each route once during `bun run build`
// and writes complete HTML (head tags included) — the deploy stays fully static.
// Routes that touch three.js/Threlte at module scope opt out with a per-route
// `ssr = false` and keep emitting the app shell.
export const prerender = true;
