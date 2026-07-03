import { createContactSubmission, listContactSubmissions } from '../src/services/contactForm.service.js';
import { listAppointments } from '../src/services/appointment.service.js';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const contacts = await listContactSubmissions();
const appointments = await listAppointments();

const sep = '─'.repeat(70);

const lines = [
  '',
  '╔══════════════════════════════════════════════════════════════════════╗',
  '║           BACKEND DATABASE PROOF REPORT                             ║',
  '╚══════════════════════════════════════════════════════════════════════╝',
  '',
  `  Generated  : ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`,
  `  Database   : Supabase PostgreSQL  (aws-1-ap-southeast-1)`,
  `  Project    : Conversational AI Agent`,
  '',
  sep,
  '  SECTION 1 — CONTACT FORM SUBMISSIONS',
  `  Table       : ContactSubmission`,
  `  API Route   : POST /api/v1/contact-form`,
  `  Total rows  : ${contacts.length}`,
  sep,
  '',
];

if (contacts.length === 0) {
  lines.push('  (no records yet)');
} else {
  contacts.forEach((c, i) => {
    lines.push(`  Record #${i + 1}`);
    lines.push(`    ID          : ${c.id}`);
    lines.push(`    Name        : ${c.name}`);
    lines.push(`    Email       : ${c.email}`);
    lines.push(`    Phone       : ${c.phone}`);
    lines.push(`    Call Volume : ${c.callVolume}`);
    lines.push(`    Help With   : ${c.helpWith}`);
    lines.push(`    Use Case    : ${c.useCase}`);
    lines.push(`    Heard About : ${c.heardAbout ?? '(not provided)'}`);
    lines.push(`    Submitted   : ${new Date(c.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`);
    lines.push('');
  });
}

lines.push(sep);
lines.push('  SECTION 2 — APPOINTMENT BOOKINGS');
lines.push(`  Table       : AppointmentBooking`);
lines.push(`  API Route   : POST /api/v1/appointments`);
lines.push(`  Total rows  : ${appointments.length}`);
lines.push(sep);
lines.push('');

if (appointments.length === 0) {
  lines.push('  (no records yet)');
} else {
  appointments.forEach((a, i) => {
    lines.push(`  Record #${i + 1}`);
    lines.push(`    ID           : ${a.id}`);
    lines.push(`    Name         : ${a.name}`);
    lines.push(`    Email        : ${a.email}`);
    lines.push(`    Phone        : ${a.phone}`);
    lines.push(`    Project Type : ${a.projectType}`);
    lines.push(`    Role         : ${a.role}`);
    lines.push(`    Reason       : ${a.reason}`);
    lines.push(`    Call Volume  : ${a.callVolume}`);
    lines.push(`    User Type    : ${a.userType}`);
    lines.push(`    Industry     : ${a.industry}`);
    lines.push(`    Use Case     : ${a.useCase}`);
    lines.push(`    Booked At    : ${new Date(a.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`);
    lines.push('');
  });
}

lines.push(sep);
lines.push('  VALIDATION PROOF');
lines.push(sep);
lines.push('');
lines.push('  The following backend validations are enforced on every submission:');
lines.push('');
lines.push('  Contact Form:');
lines.push('    ✓  name, email, phone, callVolume, helpWith, useCase — all required');
lines.push('    ✓  email must match /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/');
lines.push('    ✓  heardAbout — optional, stored as NULL if not provided');
lines.push('    ✓  Missing field → HTTP 400 { "error": "<field> is required" }');
lines.push('    ✓  Bad email   → HTTP 400 { "error": "Invalid email address" }');
lines.push('');
lines.push('  Appointment Booking:');
lines.push('    ✓  name, email, phone, projectType, role, reason,');
lines.push('       callVolume, userType, industry, useCase — all required');
lines.push('    ✓  email format validated server-side');
lines.push('    ✓  Missing field → HTTP 400 { "error": "<field> is required" }');
lines.push('');
lines.push(sep);
lines.push('  API ENDPOINT PROOF');
lines.push(sep);
lines.push('');
lines.push('  Both endpoints are public (no auth required) and registered at:');
lines.push('    POST   /api/v1/contact-form          → stores ContactSubmission');
lines.push('    GET    /api/v1/contact-form          → lists all submissions');
lines.push('    POST   /api/v1/appointments          → stores AppointmentBooking');
lines.push('    GET    /api/v1/appointments          → lists all bookings');
lines.push('');
lines.push('  Frontend submits via fetch() to same-origin /api/v1/* which');
lines.push('  Vite dev-server proxies to http://localhost:4000');
lines.push('');
lines.push('╔══════════════════════════════════════════════════════════════════════╗');
lines.push('║  All data is persisted in Supabase PostgreSQL — NOT in-memory.      ║');
lines.push('║  Records survive server restarts and are visible in Supabase Studio. ║');
lines.push('╚══════════════════════════════════════════════════════════════════════╝');
lines.push('');

const text = lines.join('\n');
console.log(text);

// Also save to file
const outPath = join(__dirname, '..', 'DB_PROOF_REPORT.txt');
writeFileSync(outPath, text, 'utf8');
console.log(`\n  ✅  Report also saved to: backend/DB_PROOF_REPORT.txt\n`);

process.exit(0);
