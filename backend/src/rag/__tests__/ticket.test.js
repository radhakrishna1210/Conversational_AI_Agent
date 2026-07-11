/**
 * Ticket Flow Unit Tests
 * Run with: node backend/src/rag/__tests__/ticket.test.js
 */

import { startTicketFlow, handleTicketFlow, isTicketFlowActive } from '../ticketFlow.js';

let passed = 0;
let failed = 0;

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.error(`  ✗  ${label}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

import prisma from '../../config/prisma.js';
import { geminiService } from '../../services/gemini.service.js';

// We can mock geminiService using a spy/override if it was a class instance, 
// but since it's an object exported, we might be able to mutate its properties if not frozen.
// Wait, geminiService is a class instance exported from the module! Let's mock the generateResponse method.
const originalGenerateResponse = geminiService.generateResponse;
geminiService.generateResponse = async (msg) => {
  return JSON.stringify({
    title: "Custom Title",
    category: "Custom Category",
    description: msg,
    priority: "High",
    summary: "A summary"
  });
};

async function cleanupDB() {
  await prisma.supportTicket.deleteMany({
    where: { source: 'chatbot' }
  });
}

async function runTests() {
  console.log('\n[1] Preconfigured Ticket Flow');
  let sessionId = 'session1';
  
  assert('Ticket flow is not active initially', !isTicketFlowActive(sessionId));
  
  let res = startTicketFlow(sessionId, 'I want to raise a ticket');
  assert('startTicketFlow returns success', res.success === true);
  assert('Response prompts for category', res.message.includes('Please choose one of the following'));
  assert('Ticket flow is active', isTicketFlowActive(sessionId));

  res = await handleTicketFlow(sessionId, 'Billing');
  assert('Matched Billing category', res.message.includes('Invoice ID'));
  
  res = await handleTicketFlow(sessionId, 'INV-1234');
  assert('Prompted for Description', res.message.includes('What seems to be the issue'));

  res = await handleTicketFlow(sessionId, 'Overcharged');
  assert('Prompted for Priority', res.message.includes('priority'));

  res = await handleTicketFlow(sessionId, 'High');
  assert('Shows Ticket Summary', res.message.includes('Ticket Summary'));
  assert('Summary includes Category: Billing', res.message.includes('Category: Billing'));
  assert('Summary includes Priority: High', res.message.includes('Priority: High'));

  res = await handleTicketFlow(sessionId, 'yes');
  assert('Ticket created successfully', res.message.includes('Ticket created successfully'));
  assert('Ticket flow no longer active', !isTicketFlowActive(sessionId));
  
  // Verify DB
  let createdTickets = await prisma.supportTicket.findMany({ where: { source: 'chatbot' } });
  assert('DB function called once', createdTickets.length === 1);
  assert('Ticket data is correct', createdTickets[0].category === 'Billing' && createdTickets[0].priority === 'High');

  console.log('\n[2] Custom Ticket Flow');
  await cleanupDB();
  sessionId = 'session2';
  startTicketFlow(sessionId, 'raise ticket');
  
  res = await handleTicketFlow(sessionId, 'my outbound campaign stops after 5 minutes');
  assert('Shows Ticket Summary directly (via Gemini mock)', res.message.includes('Ticket Summary'));
  assert('Summary includes mocked Category', res.message.includes('Category: Custom Category'));
  
  res = await handleTicketFlow(sessionId, 'yes');
  assert('Ticket created successfully', res.message.includes('Ticket created successfully'));
  assert('Ticket flow inactive', !isTicketFlowActive(sessionId));
  
  createdTickets = await prisma.supportTicket.findMany({ where: { source: 'chatbot' } });
  assert('DB function called', createdTickets.length === 1);
  assert('Ticket data matches LLM output', createdTickets[0].priority === 'High' && createdTickets[0].category === 'Custom Category');

  console.log('\n[3] Cancel Ticket Flow');
  await cleanupDB();
  sessionId = 'session3';
  startTicketFlow(sessionId, 'raise ticket');
  
  res = await handleTicketFlow(sessionId, 'cancel');
  assert('Ticket cancelled', res.message.includes('cancelled'));
  assert('Ticket flow inactive', !isTicketFlowActive(sessionId));
  
  createdTickets = await prisma.supportTicket.findMany({ where: { source: 'chatbot' } });
  assert('No ticket created', createdTickets.length === 0);

  // Restore original geminiService
  geminiService.generateResponse = originalGenerateResponse;
  await cleanupDB();

  // ─── Summary ─────────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(55)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error('Some tests FAILED');
    process.exit(1);
  } else {
    console.log('All tests PASSED ✓');
  }
}

runTests();
