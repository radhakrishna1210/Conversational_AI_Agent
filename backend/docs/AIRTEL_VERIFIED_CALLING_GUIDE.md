# Getting an Airtel-Authorised Number (Show Your Company Name, Not "Spam")

**Why:** Airtel's AI spam filter scores calls on ~250 signals (volume, pacing, complaints). A random SIM/number making repeated AI-agent calls gets flagged "Spam likely" within days, and pick-up rates collapse. The fix is Airtel's verified enterprise calling stack: after setup, your calls display your **company name, logo, and a verified badge** on the recipient's screen.

**The pipeline:** Register on Airtel DLT → Get Airtel IQ enterprise voice → Connect the AI agent → Activate Verified Business Caller ID → Follow anti-spam dialing rules.

## Step 1 — Register your business on Airtel DLT (mandatory, ~3–7 working days)
DLT (Distributed Ledger Technology) is TRAI's blockchain registry of legitimate commercial senders. Unregistered commercial callers are blocked or flagged by default.
1. Go to Airtel's DLT portal: **dltconnect.airtel.in** → "Entity Registration" as a **Principal Entity (PE)**.
2. Documents needed: **GST certificate, company PAN, Certificate of Incorporation**, authorised-signatory ID (Aadhaar/PAN) and a letter of authorisation. One-time registration fee (~₹5,000 + GST, payable online).
3. You receive a unique **PE ID** — needed for every step after this.
4. Register **Consent Templates**: proof that customers opted in to receive automated calls from you (e.g., "I agree to receive appointment calls from <Company>"). Your AI agent should only dial numbers with recorded consent.
5. Register your **Headers/CLIs** — the exact numbers your AI agent will call from — so nobody else can spoof them.

## Step 2 — Get enterprise voice connectivity (Airtel IQ)
Do **not** run AI call volume through a normal SIM or landline — that's precisely what the spam filter targets.
1. Contact Airtel Business / Airtel IQ (airtel.in/business → Airtel IQ → "Talk to us") and request **Cloud Voice / SIP trunking for automated outbound calling**, quoting your PE ID.
2. You'll be provisioned **virtual numbers / SIP trunks** built for concurrent programmatic dialing, plus **Voice API credentials**.
3. Commercials are volume-based; ask specifically for **outbound OBD/voice-bot plans**.

## Step 3 — Connect this platform
- Point the platform's telephony layer at your Airtel IQ SIP trunk or Voice API (instead of, or alongside, Twilio). The agent brain, transcripts, emotions, and post-call delivery all stay the same — only the carrier leg changes.
- Set your Airtel-provisioned number as the default caller ID; per-call override is supported via the "Call from" picker.

## Step 4 — Activate Verified Business Caller ID (Business Name Display)
1. Through your Airtel Business account manager, enrol in **Business Name Display / Verified Business Caller ID** for the registered numbers.
2. Submit your **brand name (exactly as registered), logo, and call category** (e.g., "Appointment Scheduling").
3. After approval, recipients on Airtel see **your company name + green verified tick** instead of an unknown number — pick-up rates typically improve dramatically and manual spam-marking drops.

## Step 5 — Anti-spam dialing hygiene (or even verified numbers get throttled)
- **Scrub against NDNC/DND**: never auto-dial numbers on the National Do Not Call registry; scrub your lists before every campaign.
- **Pace, don't burst**: no rapid redials of unanswered numbers (e.g., >3 attempts/number/day looks like a spam bot).
- **Call window**: 9:00 AM – 9:00 PM IST only, unless the customer explicitly requested otherwise.
- **Always honour opt-out**: if the person says "stop calling", suppress the number platform-wide immediately.
- Keep consent records mapped to your DLT consent templates — Airtel can audit them.

## What each option in the app means
| Option | What recipients see | Spam risk | Requirements |
|---|---|---|---|
| Platform number (list) | A generic number | Medium — degrades with volume | none |
| **Your own verified number** | Your personal/business number | Lower for low volume; still flaggable at scale | 1-minute OTP call verification in the app |
| **Airtel-authorised number** (this guide) | **Company name + verified badge** | Lowest — network-level trust | DLT registration + Airtel IQ + Business Name Display |

**Checklist:** GST ☐ · PAN ☐ · Incorporation cert ☐ · DLT PE ID ☐ · Consent templates ☐ · Airtel IQ trunk/number ☐ · Business Name Display approved ☐ · NDNC scrubbing on ☐ · 9am–9pm window enforced ☐
