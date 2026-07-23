# Feature: "Call From Your Own Number" — Integration (5 minutes)

## Files in this bundle
- backend/callerNumber.controller.js → copy to backend/src/controllers/
- client/CallerNumberPicker.tsx     → copy to client/src/components/
- AIRTEL_VERIFIED_CALLING_GUIDE.md  → copy to backend/docs/ (served in-app, see 3)

## 1. Backend routes (backend/src/routes/index.js)
Add import:
    import * as callerCtrl from '../controllers/callerNumber.controller.js';
Add under the authenticated `ws` router (next to the other ws.get lines):
    ws.get('/caller-numbers', callerCtrl.listCallerNumbers);
    ws.post('/caller-numbers/verify', callerCtrl.startVerification);
    ws.get('/caller-numbers/verify/status', callerCtrl.verificationStatus);
    ws.delete('/caller-numbers', callerCtrl.removeVerified);

## 2. Let calls use the chosen number (backend/src/controllers/agent.controller.js, testCall)
Replace:
    const fromNumber = process.env.TWILIO_FROM_NUMBER;
With:
    const fromNumber = req.body.fromNumber || process.env.TWILIO_FROM_NUMBER;
(Invalid/unverified numbers are rejected by Twilio error 21210, which testCall already surfaces honestly.)

## 3. Serve the Airtel guide in-app (routes/index.js, public section)
    import { readFileSync } from 'fs';
    router.get('/config/airtel-verified-calling-guide', (_req, res) =>
      res.type('text/markdown').send(readFileSync('docs/AIRTEL_VERIFIED_CALLING_GUIDE.md', 'utf8')));
Optionally add a client route `/airtel-verified-calling` rendering that markdown (the picker links there).

## 4. Client: show the picker in the Phone Call modal (EditAgent.tsx)
    import CallerNumberPicker from '../components/CallerNumberPicker';
    const [fromNumber, setFromNumber] = useState('');
Render inside the phone-call modal above the "Call" button:
    <CallerNumberPicker value={fromNumber} onChange={setFromNumber} />
And include it in the test-call request body:
    { agentId, phoneNumber, fromNumber: fromNumber || undefined }

## User requirements (surface these in your docs/UI)
- Add-own-number: the user must have the phone in hand (answers an automated
  verification call and types the 6-digit code shown on screen); number in
  E.164 (+91…); upgraded (non-trial) Twilio account on the platform side.
- Verified numbers are OUTBOUND caller ID only — inbound still rings their
  normal carrier line.
- To display a COMPANY NAME instead of a number (and never "Spam likely") on
  Airtel, the user needs the Airtel-authorised route: see the guide (DLT
  registration with GST/PAN/Incorporation docs → Airtel IQ enterprise voice →
  Business Name Display).
