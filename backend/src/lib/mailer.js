// Minimal SMTP mailer using Node's stdlib (net + tls).
// Implements EHLO → STARTTLS → AUTH LOGIN → MAIL/RCPT/DATA, which is exactly
// what Gmail (smtp.gmail.com:587 with an app password) and most providers need.
// Written stdlib-only because this project ships without nodemailer; swap in
// nodemailer later if you prefer — the sendMail() signature matches closely.
import net from 'net';
import tls from 'tls';
import { env } from '../config/env.js';
import logger from './logger.js';

const CRLF = '\r\n';

class SmtpSession {
  constructor(socket) { this.socket = socket; this.buffer = ''; }

  upgrade(socket) { this.socket = socket; this.buffer = ''; }

  /** Read one full SMTP reply (handles multi-line "250-..." continuations). */
  read(timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const tryParse = () => {
        const lines = this.buffer.split(CRLF).filter(Boolean);
        if (!lines.length) return null;
        const last = lines[lines.length - 1];
        if (/^\d{3} /.test(last) && this.buffer.endsWith(CRLF)) {
          const reply = this.buffer; this.buffer = '';
          return { code: parseInt(last.slice(0, 3), 10), text: reply };
        }
        return null;
      };
      const immediate = tryParse();
      if (immediate) return resolve(immediate);

      const onData = (d) => {
        this.buffer += d.toString('utf8');
        const parsed = tryParse();
        if (parsed) { cleanup(); resolve(parsed); }
      };
      const onErr = (e) => { cleanup(); reject(e); };
      const timer = setTimeout(() => { cleanup(); reject(new Error('SMTP timeout')); }, timeoutMs);
      const cleanup = () => { clearTimeout(timer); this.socket.off('data', onData); this.socket.off('error', onErr); };
      this.socket.on('data', onData);
      this.socket.on('error', onErr);
    });
  }

  async cmd(line, expect = [250]) {
    if (line !== null) this.socket.write(line + CRLF);
    const reply = await this.read();
    if (!expect.includes(reply.code)) {
      throw new Error(`SMTP "${line ? line.split(' ')[0] : 'greeting'}" failed: ${reply.text.trim().slice(0, 200)}`);
    }
    return reply;
  }
}

export const isMailerConfigured = () =>
  Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD && env.EMAIL_FROM);

/**
 * Send an email. Throws with a clear message on any failure — callers surface
 * honest errors instead of pretending delivery happened.
 */
export async function sendMail({ to, subject, text, html }) {
  if (!isMailerConfigured()) {
    throw Object.assign(
      new Error('Email service is not configured (set SMTP_HOST/SMTP_USER/SMTP_PASSWORD/EMAIL_FROM in backend/.env)'),
      { statusCode: 503 }
    );
  }

  const plainSocket = await new Promise((resolve, reject) => {
    const s = net.createConnection({ host: env.SMTP_HOST, port: env.SMTP_PORT }, () => resolve(s));
    s.once('error', reject);
    s.setTimeout(15000, () => { s.destroy(); reject(new Error('SMTP connect timeout')); });
  });

  const session = new SmtpSession(plainSocket);
  try {
    await session.cmd(null, [220]);                    // greeting
    await session.cmd(`EHLO ${env.SMTP_HOST}`, [250]);
    await session.cmd('STARTTLS', [220]);

    const secure = await new Promise((resolve, reject) => {
      const t = tls.connect({ socket: plainSocket, servername: env.SMTP_HOST }, () => resolve(t));
      t.once('error', reject);
    });
    session.upgrade(secure);
    await session.cmd(`EHLO ${env.SMTP_HOST}`, [250]);

    await session.cmd('AUTH LOGIN', [334]);
    await session.cmd(Buffer.from(env.SMTP_USER).toString('base64'), [334]);
    await session.cmd(Buffer.from(env.SMTP_PASSWORD).toString('base64'), [235]);

    await session.cmd(`MAIL FROM:<${env.EMAIL_FROM}>`, [250]);
    await session.cmd(`RCPT TO:<${to}>`, [250, 251]);
    await session.cmd('DATA', [354]);

    const boundary = 'b' + Date.now().toString(36);
    const headers = [
      `From: ${env.EMAIL_FROM_NAME} <${env.EMAIL_FROM}>`,
      `To: <${to}>`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      html
        ? `Content-Type: multipart/alternative; boundary="${boundary}"`
        : 'Content-Type: text/plain; charset=utf-8',
      '',
    ];
    const body = html
      ? [`--${boundary}`, 'Content-Type: text/plain; charset=utf-8', '', text || '', `--${boundary}`,
         'Content-Type: text/html; charset=utf-8', '', html, `--${boundary}--`].join(CRLF)
      : (text || '');

    // dot-stuff lines starting with "."
    const payload = (headers.join(CRLF) + body).split(CRLF).map(l => (l.startsWith('.') ? '.' + l : l)).join(CRLF);
    session.socket.write(payload + CRLF + '.' + CRLF);
    const final = await session.read();
    if (final.code !== 250) throw new Error(`SMTP DATA rejected: ${final.text.trim().slice(0, 200)}`);

    session.socket.write('QUIT' + CRLF);
    session.socket.end();
    logger.info({ to, subject }, 'Email sent');
    return { accepted: true };
  } catch (err) {
    try { plainSocket.destroy(); } catch { /* noop */ }
    logger.error({ err: err.message, to }, 'Email send failed');
    throw Object.assign(new Error(`Failed to send email: ${err.message}`), { statusCode: 502 });
  }
}
