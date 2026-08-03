import pino from 'pino';

const base = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } }
    : undefined,
});

/**
 * Pino's signature is (mergingObject, message), but ~26 call sites across the
 * controllers use the console.error shape — logger.error('X failed', err).
 * Pino treats a leading string as the message and the rest as printf args, so
 * with no %s in the message the error was silently DROPPED: every one of those
 * failures logged a bare headline and threw away the stack that explained it.
 * That is why "Failed to save file" (and friends) were undiagnosable from the
 * logs.
 *
 * Rather than rewrite every call site (and rely on nobody writing the natural
 * shape again), the levels are normalized here: a trailing Error or object is
 * promoted into the merging object, where pino's serializers can render it.
 * Genuine printf use (`logger.info('took %dms', ms)`) is untouched — only
 * Error/object second arguments are re-homed.
 */
const LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'];

const normalize = (target, level) => (...args) => {
  const [first, second, ...rest] = args;
  if (typeof first === 'string' && second !== null && typeof second === 'object' && rest.length === 0) {
    const merged = second instanceof Error ? { err: second } : second;
    return target[level](merged, first);
  }
  return target[level](...args);
};

const decorate = (instance) => {
  const wrapper = Object.create(instance);
  for (const level of LEVELS) wrapper[level] = normalize(instance, level);
  // Child loggers must keep the same behaviour, or the fix stops at the first
  // logger.child({ ... }) call.
  wrapper.child = (...args) => decorate(instance.child(...args));
  return wrapper;
};

const logger = decorate(base);

export default logger;
