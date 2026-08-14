// backend/src/config/csp.js
/**
 * The app's Content-Security-Policy.
 *
 * WHY THIS IS ITS OWN FILE
 * ------------------------
 * In production this process serves the built SPA as well as the API, so this
 * policy governs the real page. In development it governs NOTHING: the SPA is
 * served by Vite on its own origin, which sends no CSP at all. That asymmetry
 * means a missing entry here is invisible to every developer and breaks only
 * once deployed — which is exactly how wallet top-up shipped broken, with
 * Razorpay Checkout's script blocked in production and working perfectly on
 * every local machine.
 *
 * Pulled out of app.js so it can be asserted directly in a test that runs
 * anywhere, instead of only being exercised by loading a real page in a real
 * browser against a real deployment.
 *
 * Every entry below is load-bearing. Do not "tighten" one without checking the
 * page it belongs to.
 */

/*
 * Reads process.env.NODE_ENV directly rather than importing ./env.js, which
 * validates the whole environment (DATABASE_URL and friends) at import time.
 * A policy about which hosts a browser may talk to should not need a database
 * URL to be expressible — and requiring one would put this back out of reach of
 * a test, which is the entire point of the file.
 */
const isProduction = () => process.env.NODE_ENV === 'production';

/**
 * Razorpay Checkout, which needs more than the one host people expect.
 *
 * `checkout.razorpay.com` serves the script the page injects
 * (client/src/lib/razorpayCheckout.ts). `api.razorpay.com` is what the payment
 * IFRAME is served from. Allowing only the script host gets you a Checkout that
 * loads and then renders an empty modal — a considerably worse bug to diagnose
 * than a script that is cleanly blocked.
 *
 * The wildcard covers the CDN, regional, and bank-redirect hosts Checkout uses.
 * Those are not a stable documented list, and pinning a guess would break
 * payments the day Razorpay adds a host.
 */
export const RAZORPAY_HOSTS = {
  script: ['https://checkout.razorpay.com'],
  frame: ['https://api.razorpay.com', 'https://checkout.razorpay.com', 'https://*.razorpay.com'],
};

/** Calendly's PopupModal on the Contact page (client/src/pages/Contact.tsx). */
const CALENDLY_HOSTS = {
  script: ['https://assets.calendly.com'],
  style: ['https://assets.calendly.com'],
  frame: ['https://calendly.com', 'https://assets.calendly.com'],
};

export const cspDirectives = () => ({
  defaultSrc: ["'self'"],

  // 'unsafe-inline': the pre-paint theme script in client/index.html that stops
  // a light-mode user seeing a dark flash. Swap for a hash if it ever goes
  // static.
  scriptSrc: ["'self'", "'unsafe-inline'", ...CALENDLY_HOSTS.script, ...RAZORPAY_HOSTS.script],

  // 'unsafe-inline': Tailwind and framer-motion both set inline styles.
  styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', ...CALENDLY_HOSTS.style],

  fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
  imgSrc: ["'self'", 'data:', 'blob:', 'https:'],

  // blob:/data: — TTS audio is played back from Blob URLs.
  mediaSrc: ["'self'", 'data:', 'blob:'],
  workerSrc: ["'self'", 'blob:'],

  // ws:/wss: — the voice web-call sockets (client/src/services/modularCallSocket.ts).
  connectSrc: ["'self'", 'ws:', 'wss:', 'https:'],

  frameSrc: ["'self'", ...CALENDLY_HOSTS.frame, ...RAZORPAY_HOSTS.frame],

  // Same hosts as frameSrc. `child-src` is the pre-CSP3 spelling and is still
  // what older WebKit enforces for iframes — a payment form that works
  // everywhere except an old iPhone is the failure this prevents.
  childSrc: ["'self'", ...RAZORPAY_HOSTS.frame],

  // Netbanking and some card flows leave the iframe by POSTing a form to the
  // bank's own domain. helmet defaults this to `'self'`, which kills that
  // redirect at the final step of a real payment — after the customer has
  // entered their details.
  formAction: ["'self'", ...RAZORPAY_HOSTS.frame],

  objectSrc: ["'none'"],

  // Only in production: locally the API is plain http and upgrading would make
  // every request fail.
  upgradeInsecureRequests: isProduction() ? [] : null,
});
