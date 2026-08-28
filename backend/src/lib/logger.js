import fs from 'fs';
import path from 'path';
import pino from 'pino';

// pino's worker_thread-based `transport` option is incompatible with Node's
// --watch on Windows: the watch supervisor's restart/teardown doesn't
// coordinate with the transport worker's lifecycle and silently kills the
// process. Pretty-printing is applied out-of-process instead by piping
// through the `pino-pretty` CLI in the dev/start scripts.
//
// The same constraint rules out a file transport, so warn-and-worse is
// mirrored to disk through a plain append stream instead. WHY it needs to be
// on disk at all: every log line lived only in the terminal that started the
// process. A request that failed at the end of a call — the exact failure a
// user reports minutes later — left no artefact anywhere, so the only copy of
// the error was scrollback in a window that may already have been closed or
// restarted. Diagnosis meant asking the user to reproduce it.
const configuredLevel = process.env.LOG_LEVEL ?? 'info';
const ERROR_LOG_PATH = process.env.ERROR_LOG_PATH
  ?? path.resolve(process.env.LOG_DIR || 'logs', 'backend-error.log');

/** Keep one previous file rather than growing forever. Checked at boot only — a
 *  restart is the natural rotation point and warn+ traffic is low enough that
 *  mid-run rotation would be machinery for nothing. */
const ERROR_LOG_MAX_BYTES = 5 * 1024 * 1024;

const streams = [{ level: configuredLevel, stream: process.stdout }];
try {
  fs.mkdirSync(path.dirname(ERROR_LOG_PATH), { recursive: true });
  if ((fs.statSync(ERROR_LOG_PATH, { throwIfNoEntry: false })?.size ?? 0) > ERROR_LOG_MAX_BYTES) {
    fs.renameSync(ERROR_LOG_PATH, `${ERROR_LOG_PATH}.1`);
  }
  streams.push({ level: 'warn', stream: fs.createWriteStream(ERROR_LOG_PATH, { flags: 'a' }) });
} catch {
  // A read-only or full disk must not stop the process from starting or from
  // logging to stdout. Losing the file copy is a degraded log, not an outage.
}

// The instance level gates before any stream does, so it has to sit at the
// lower of the two — otherwise LOG_LEVEL=error would silently empty the warn
// file it was never meant to affect.
const levelValue = (name) => pino.levels.values[name] ?? pino.levels.values.info;
const base = pino(
  { level: levelValue(configuredLevel) <= levelValue('warn') ? configuredLevel : 'warn' },
  pino.multistream(streams),
);

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
