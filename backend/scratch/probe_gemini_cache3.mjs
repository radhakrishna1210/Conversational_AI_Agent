// Probe v3: steady-state implicit-cache hit rate for shape B (KB as contents prefix),
// over a realistic call length, at two KB sizes — to see if cost goes FLAT.
import { GoogleGenerativeAI } from '@google/generative-ai';

const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const MODEL = 'gemini-2.5-flash';
const client = new GoogleGenerativeAI(key);
const preamble = 'You are a voice agent for City Medical Hospital.';

const makeKb = (sections) => Array.from({ length: sections }, (_, i) =>
  `Section ${i}: City Medical Hospital operates department ${i} with consulting hours 9am-5pm. ` +
  `The department head is Dr. Example ${i}. Standard consultation fee is ${500 + i} rupees. ` +
  `Appointments require 24 hours notice and can be rescheduled once without charge.`
).join('\n');

const QS = ['What are the consulting hours?', 'Who heads department 12?', 'Fee for department 40?',
  'Can I reschedule?', 'How much notice is needed?', 'Who heads department 3?',
  'What is the fee for department 7?', 'Are you open Sundays?', 'Who heads department 55?',
  'What is the rescheduling policy?', 'Fee for department 100?', 'Consulting hours again please?'];

const trial = async (labelKb, sections) => {
  const kb = makeKb(sections);
  const kbBytes = Buffer.byteLength(`# Knowledge Base\n${kb}`);
  const model = client.getGenerativeModel({ model: MODEL, systemInstruction: preamble });
  const history = [
    { role: 'user', parts: [{ text: `# Knowledge Base\n${kb}` }] },
    { role: 'model', parts: [{ text: 'Understood. I will ground my answers in this knowledge base.' }] },
  ];
  console.log(`\n=== ${labelKb} (${(kbBytes / 1024).toFixed(1)} KB text) ===`);
  let billed = 0, cachedTot = 0, promptTot = 0;
  for (let i = 0; i < QS.length; i++) {
    const r = await model.generateContent({
      contents: [...history, { role: 'user', parts: [{ text: QS[i] }] }],
      generationConfig: { maxOutputTokens: 30, temperature: 0 },
    });
    const u = r.response.usageMetadata || {};
    const cached = u.cachedContentTokenCount ?? 0;
    const full = u.promptTokenCount - cached;
    billed += full * 0.30 / 1e6 + cached * 0.075 / 1e6;
    cachedTot += cached; promptTot += u.promptTokenCount;
    process.stdout.write(`  t${String(i + 1).padStart(2)} prompt=${u.promptTokenCount} cached=${String(cached).padStart(6)} (${((cached / u.promptTokenCount) * 100).toFixed(0)}%)\n`);
    await new Promise((res) => setTimeout(res, 900));
  }
  const hitRate = cachedTot / promptTot;
  // 3 agent turns/min; QS.length turns ~= QS.length/3 minutes of call
  const perMin = (billed / (QS.length / 3)) * 96;
  const uncachedPerMin = ((promptTot * 0.30 / 1e6) / (QS.length / 3)) * 96;
  console.log(`  -> overall cached ${(hitRate * 100).toFixed(0)}% | with cache Rs ${perMin.toFixed(2)}/min | without Rs ${uncachedPerMin.toFixed(2)}/min`);
  return { kbBytes, perMin, uncachedPerMin, hitRate };
};

const small = await trial('SMALL KB', 60);    // ~16 KB, your median agent
const large = await trial('LARGE KB', 530);   // ~140 KB, your worst agent

console.log(`\n=== DOES COST GO FLAT? ===`);
console.log(`           ${'KB'.padStart(8)}  ${'no cache'.padStart(10)}  ${'cached'.padStart(10)}`);
for (const [n, r] of [['small', small], ['large', large]]) {
  console.log(`  ${n.padEnd(8)} ${((r.kbBytes / 1024).toFixed(1) + ' KB').padStart(8)}  ${('Rs ' + r.uncachedPerMin.toFixed(2)).padStart(10)}  ${('Rs ' + r.perMin.toFixed(2)).padStart(10)}`);
}
const spreadBefore = large.uncachedPerMin - small.uncachedPerMin;
const spreadAfter = large.perMin - small.perMin;
console.log(`\n  spread small->large: Rs ${spreadBefore.toFixed(2)}/min uncached  ->  Rs ${spreadAfter.toFixed(2)}/min cached`);
console.log(`  flattening: ${((1 - spreadAfter / spreadBefore) * 100).toFixed(0)}% of the KB-size penalty removed`);
