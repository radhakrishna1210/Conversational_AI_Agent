// backend/src/config/cors.js
/**
 * CORS origin policy, kept out of app.js so it can be asserted in a test.
 *
 * The rejection path matters more than the allow path. The `cors` package
 * treats an Error passed to its callback as a request failure, which lands in
 * errorHandler as HTTP 500 with the rejection text in the body — for ANY
 * request carrying an unlisted Origin, preflight or not, even `GET /health`.
 * Measured on the running backend: `Origin: https://evil.example` -> 500
 * {"error":"Internal server error","message":"CORS: origin ... not allowed"}.
 *
 * That is wrong three ways: a policy decision reported as a server fault, the
 * allow-list logic echoed to the caller, and every cross-origin probe logged
 * at error level. The correct answer to a disallowed origin is silence:
 * `callback(null, false)` sends no Access-Control-* headers at all, and the
 * browser enforces the policy on its side. Non-browser clients that happen to
 * send an Origin header keep working, because CORS was never meant to gate
 * them.
 */

const LOCAL_DEV_ORIGINS = ['http://localhost:5173', 'http://localhost:5174'];

/**
 * @param {{ clientUrl?: string|null, nodeEnv?: string }} opts
 * @returns {string[]} de-duplicated, trimmed, non-empty origins
 */
export function allowedOriginsFrom({ clientUrl, nodeEnv } = {}) {
  const clientUrls = clientUrl ? String(clientUrl).split(',').map((u) => u.trim()) : [];
  const dev = nodeEnv !== 'production' ? LOCAL_DEV_ORIGINS : [];
  return [...new Set([...clientUrls, ...dev])].filter(Boolean);
}

/**
 * The `origin` option for the `cors` middleware.
 *
 * @param {string[]} allowed
 * @returns {(origin: string|undefined, cb: (err: Error|null, allow?: boolean) => void) => void}
 */
export function corsOriginFor(allowed) {
  const set = new Set(allowed);
  return (origin, callback) => {
    // No Origin header: same-origin, curl, server-to-server. Not a CORS request.
    if (!origin) return callback(null, true);
    // Disallowed: no error, no headers. See the file comment.
    callback(null, set.has(origin));
  };
}

/** Full options object for `cors(...)`. */
export function buildCorsOptions({ clientUrl, nodeEnv } = {}) {
  return {
    origin: corsOriginFor(allowedOriginsFrom({ clientUrl, nodeEnv })),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  };
}
