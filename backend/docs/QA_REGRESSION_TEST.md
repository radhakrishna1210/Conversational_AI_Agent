**Q U A L I T Y A S S U R A N C E · B L A C K \- B O X R E G R E S S I O N**

# **Full Product Regression Test Sheet**

Every user-facing area of the voice-agent platform, written so anyone on the team can run it through the browser alone. Optional deeper checks are marked for whoever has database, log or API access.

BUILD UNDER TEST

main — 3743c92

DATE

30 Aug 2026

MODULES

24

TEST CASES

314

TESTER	ENVIRONMENT

1. **How to use this sheet**	Read once. Everything after this page is test cases.

**The columns**

* **ID** — quote this in every bug report. Never renumber.

* **Test case & steps** — do exactly these, in order. If a step is impossible, that is a **Blocked**, not a Fail.

* **Expected result** — the whole expectation. If *any* part of it is wrong, the case Fails.

* **P** — priority. Run all P1 first if you are short on time.

* **Result** — write P / F / B / N/A.

* **Notes** — the bug ID, or what you actually saw.

**Result codes**

* **P — Pass.** Everything in Expected happened.

* **F — Fail.** Raise a defect. Always.

* **B — Blocked.** You could not reach the test (a prerequisite failed, no credit, no number). Say what blocked you.

* **N/A** — not applicable to this environment (e.g. a paid carrier feature on a trial account).

**Priorities**

* P1 — blocks release. Money, calls, login, data loss, security.

* **P2** — a real user would complain. Ship only with a known-issue note.

* P3 — cosmetic or edge case. Log it, do not block on it.

2. **Environment & test data setup**	Do all of this before case 1\. Most "random" failures are missing setup.

   1. **— Browsers to cover**

Run the **full** sheet on Chrome desktop. Then repeat only the P1 cases on the others. Voice calls need microphone permission, which Safari and mobile browsers handle differently — that is deliberately in scope.

* Chrome (latest) — desktop, Windows or Mac — **full pass**

  * Edge (latest) — desktop — P1 only

    * Safari (latest) — Mac — P1 only, plus every web-call case

    * Chrome on Android and Safari on iOS — P1 only, plus the whole responsive module

  2. **— Accounts you need**

     * **ADMIN** — a super-admin login that can reach /admin .

     * **CLIENT-A** — an ordinary workspace with wallet credit, at least one phone number, and at least one agent.

     * **CLIENT-B** — a second ordinary workspace, **empty**, different email. Used to prove one workspace cannot see another's data. This is not optional.

     * **NEW** — an email address that has never signed up, for the registration cases. A Gmail

  3. **— Data to prepare**

     * Two phone numbers **you personally control** and can answer, for inbound and outbound call tests. Never a customer's.

     * A CSV of 5 contacts using your own numbers, with columns for name, phone and company.

     * A small PDF and a DOCX (2–5 pages) for the knowledge base.

     * A deliberately oversized file (over the stated upload limit) and a disallowed type (e.g. .exe ) for the negative cases.

     * A 30–60 second clean voice recording (WAV or MP3) for voice cloning.

     * A test payment method Finance has approved for the wallet top-up cases.

address with a	suffix works.

* **ZERO** — a workspace with a wallet balance of ₹0, for the "out of credit" cases.

Write the actual logins on a separate sheet. Do not write passwords on this document.

4. **— Before every module**

   * Hard refresh ( Ctrl+Shift+R ) so you are not testing a cached bundle.

     * Open the browser console ( F12 ). A red error there during a passing case is still worth a P3 note.

     * Note the wallet balance at the start and end of any calling module.

1	**Public website & navigation**	Logged out, in a private window. This is what a prospect sees.

| ID | TEST CASE & STEPS | EXPECTED RESULT | P | RESULT | NOTES |
| :---- | :---- | :---- | :---: | :---- | :---- |
| **PUB-01** | **Home page loads** Open the site root in a private window. Let it settle, then scroll to the footer. | Page renders fully. No blank areas, no broken images, no placeholder text such as "lorem ipsum" or "TODO". Nothing shifts position after the page settles. | P1 | P | Page renders fully with hero section, live agent demo widget, audio replay, industry marquee cards, and footer. No broken images or layout shifts. |
| **PUB-02** | **Top navigation** Click every item in the header menu, including items inside dropdowns. Use the browser Back button after each. | Every link opens a real page. No 404, no blank white screen. The header stays visible and the active item is highlighted. | P1 | P | All navbar links and dropdown menus (Solutions verticals/use-cases, Integrations, Documentation, Pricing, Contact Us, Book Appointment, Auth CTAs) resolve cleanly. |
| **PUB-03** | **Vertical solution pages** Visit each: Finance, Education, Ecommerce, Real Estate, Insurance, Healthcare, Restaurants. | All seven load with content written for that industry — not the same generic copy repeated. Headings and imagery differ per page. | **P2** | P | All 7 vertical pages (/solutions/verticals/*) load distinct, industry-tailored copy, metrics, workflows, and custom CTA triggers. |
| **PUB-04** | **Use-case pages** Visit each: Lead Generation, Collections, Negotiation, Customer Support, Appointments. | All five load with distinct content and a working call-to-action button. | **P2** | P | All 5 use-case pages (/solutions/use-cases/*) render specialized architectures, flow diagrams, and active CTA buttons linking to /signup / /contact. |
| **PUB-05** | **Integration marketing pages** Visit the Cal.com, Salesforce, Custom API and SIP Trunking pages. | All four load. Any product claim on them matches what the app actually offers — flag anything advertised here that does not exist in the dashboard. | **P2** | F | Pages load but embedded demo/explainer videos do not play. Some advertised integration features are not yet fully implemented in the dashboard — content is ahead of the actual product state. |
| **PUB-06** | **Pricing page shows no prices** Open the Pricing page. Read every panel, then use Ctrl+F for the rupee symbol and for "per minute". | **No monetary figure appears anywhere.** Pricing is deliberately contact-led: the page should route the visitor into a sales conversation. Any visible rate, plan price or "starting at" figure is a P1 defect. | P1 | P | Verified: No monetary figures, subscription plan rates or prices exposed on /pricing. Explains the talk-minutes wallet model and routes to /contact. |
| **PUB-07** | **Contact form — happy path** Open Contact. Fill every field with realistic values and submit. | A clear success message appears. The form clears or is replaced by a confirmation. No raw JSON or error code on screen.  **Deeper check:** the enquiry appears under Admin → Contact Requests within a minute. | P1 | F | Form renders all fields correctly. **Bug:** Work email field blindly rejects all @gmail.com addresses — including legitimate Google Workspace / company Gmail accounts — with "Please use a business email address". This is a false-positive validation defect; the domain-block logic does not account for businesses using Gmail as their email provider. Form cannot be submitted with a Google Workspace email. |
| **PUB-08** | **Contact form — validation** Submit the form completely empty. Then submit with e-mail abc@ and a 3-digit phone number. | Submission is refused both times, with a message naming the specific field at fault. Nothing is sent. The page does not reload or lose data you already typed. | **P2** | P | Validation works correctly. Empty submission and malformed inputs are refused with field-level messages. Additionally, the Work email field enforces **business-domain validation** — Gmail/consumer addresses are rejected with "Please use a business email address" inline. |

| ID | TEST CASE & STEPS | EXPECTED RESULT | P | RESULT | NOTES |
| :---- | :---- | :---- | :---: | :---- | :---- |
| **PUB-09** | **Book an appointment** Open Book Appointment. Pick a slot, complete the form, submit. | Booking confirmed on screen with the date and time echoed back. The time shown matches the slot you picked, in your own time zone.  **Deeper check:** it appears under Admin → Appointments. | P1 | F | **Same bug as PUB-07:** The booking form rejects @gmail.com addresses — including legitimate Google Workspace / company Gmail accounts — with a business email warning. Form cannot be submitted with a Google Workspace email. Appointment booking is blocked for any user whose company uses Gmail. |
| **PUB-10** | **Past date cannot be booked** On Book Appointment, try to select yesterday. | Past dates are disabled, or rejected with a message. No booking is created. | **P2** | B | **Blocked:** No date selection field exists in the booking form. The test step (selecting yesterday) cannot be performed. Dependent on PUB-09 fix — booking form needs a date/slot picker before this case can be tested. |
| **PUB-11** | **Documentation and Docs pages** Open Documentation, then Docs. Follow three internal links; use the search if one is present. | Content renders with correct formatting. Internal links resolve. Code samples are readable and not cut off at the edge. | P3 | F | /docs page loads with the correct landing layout (Getting started, Client, Agent, Call, Integrations, Knowledge base cards). However, **the "Learn more →" internal links on each card do not open** — clicking them does nothing or fails to navigate. Internal link resolution is broken; deeper doc content is inaccessible. |
| **PUB-12** | **Report an issue (public)** Open Report Issue while logged out. Submit a report with a clearly marked test title. | Accepted with a confirmation.  **Deeper check:** it lands in Admin → Reported Issues with your text intact. | **P2** | F | Feature not implemented — no "Report an Issue" page or entry point found in the public-facing site while logged out. Page/route does not exist. |
| **PUB-13** | **Airtel verified calling page** Open the Airtel Verified Calling page. | Loads with its own layout and content, no broken assets. | P3 | F | Feature not implemented — /airtel-verified-calling page does not exist or is not found. Route is not accessible. |
| **PUB-14** | **Unknown URL** Visit a nonsense path such as /this-does-not-exist . | A friendly not-found page with a way back home. **Not** raw JSON, not a stack trace, not an endless spinner. | **P2** | F | Visiting an unknown/nonsense URL shows a **blank page** — no friendly 404 message, no navigation back home. SPA routing does not handle unmatched routes correctly. |
| **PUB-15** | **Deep link survives refresh** Open any solutions page by typing its URL directly. Press F5. | The same page reloads. It must not fall back to the home page or a not-found page. | **P2** | P | Direct deep links (e.g. /solutions/verticals/finance, /pricing, /documentation) reload directly to the target component via SPA history routing. |
| **PUB-16** | **Footer links** Click every footer link, including any legal or policy links. | All resolve. Any privacy or terms link opens a real document, not a placeholder. | P3 | P | All links in the 4-column footer (Product, Solutions, Developers, Company) point to live application routes; Privacy/Terms route to official contact/inquiry handlers. |

2	**Sign-up, login & account access**	Use the NEW e-mail for registration cases. Work in a private window throughout.

| ID | TEST CASE & STEPS | EXPECTED RESULT | P | RESULT | NOTES |
| :---- | :---- | :---- | :---: | :---- | :---- |
| **AUT-01** | **Sign up with e-mail** Open Sign Up. Register with the NEW e-mail and a strong password. Complete anything the flow asks for afterwards. | The account is created and you reach the dashboard, or a clearly worded "check your e-mail" screen. If verification is required, the e-mail actually arrives — wait five minutes before failing this. | P1 | P | Account registration completes with HTTP 201; creates user entity, default workspace, and member role in database. |
| **AUT-02** | **Duplicate e-mail** Try to sign up again using CLIENT-A's existing e-mail. | Refused, with a message saying the account already exists and a link to log in. The existing account is untouched. | P1 | P | Registration rejected with HTTP 409 ("Email already registered"). Existing user data and workspace remain untouched. |
| **AUT-03** | **Weak password rejected** Try to sign up with the password 123 . | Rejected, with the rule stated (length, characters). The rule shown must match the rule actually enforced. | **P2** | P | Rejected with HTTP 400 validation error requiring minimum 8 characters ("String must contain at least 8 character(s)"). |
| **AUT-04** | **Malformed e-mail rejected** Try test@ , then test.com , then a value containing a space. | All three refused with a field-level message. No account is created. | **P2** | P | Malformed email addresses (missing domain, missing @, spaces) rejected with HTTP 400 ("Invalid email"). |
| **AUT-05** | **Login with correct credentials** Log in as CLIENT-A. | You land on the dashboard within a few seconds. The workspace name and your account appear in the interface. | P1 | P | Successful login returns HTTP 200 with signed JWT accessToken, refreshToken, user profile, and active workspace object. |
| **AUT-06** | **Login with wrong password** Log in as CLIENT-A with a deliberately wrong password. | Refused with a generic message. It must **not** reveal whether the e-mail exists — no "wrong password" versus "no such user" distinction. | P1 | P | Refused with generic HTTP 401 ("Invalid credentials"), preventing account enumeration. |
| **AUT-07** | **Login with unknown e-mail** Log in with an address that has never registered. | The same generic refusal as AUT-06, word for word. | **P2** | P | Returns identical generic HTTP 401 ("Invalid credentials") error as wrong password. |
| **AUT-08** | **Google sign-in** Use the Google sign-in button. Complete consent with a Google account. | You are returned to the app logged in, on the dashboard. No error page and no redirect loop between login and callback. | P1 | P | Google OAuth endpoint generates valid consent URL with client_id and scopes; callback exchanges auth code and securely issues tokens via fragment hash. |
| **AUT-09** | **Cancel the Google consent** Start Google sign-in, then press Cancel or Back at the Google screen. | You return to the login page with a plain message. Not a blank screen, not a stack trace, and no half-created account. | **P2** | P | When consent is cancelled (error=access_denied), callback redirects cleanly to /login?error=google_denied with no stack trace or half-created user. |
| **AUT-10** | **Forgot password end to end** Use Forgot Password with CLIENT-A's e-mail. Open the e-mail and follow the link. Set a new password, then log in with it. | The reset e-mail arrives, the link opens a working form, the new password logs you in, and the old password no longer works. | P1 | F | **SMTP not configured:** /forgot-password page shows error banner — "Password reset requires the email service, which is not configured on this server (SMTP_HOST/SMTP_USER/SMTP_PASSWORD/EMAIL_FROM in backend/.env). Ask the administrator to set it up." No reset email is sent. Feature completely non-functional. |
| **AUT-11** | **Reset for an unknown e-mail** Request a reset for an address that does not exist. | A neutral "if the account exists you will receive an e-mail" message. It must not confirm or deny that the account exists. | **P2** | F | **Same SMTP issue as AUT-10:** Page displays a technical server configuration error message instead of the expected neutral response. The error text reveals internal env var names (SMTP_HOST, SMTP_USER, etc.) — this is a **security information leak** in addition to a broken feature. |

| ID | TEST CASE & STEPS | EXPECTED RESULT | P | RESULT | NOTES |
| :---- | :---- | :---- | :---: | :---- | :---- |
| **AUT-12** | **Reset link cannot be reused** After completing AUT-10, open the same reset link a second time. | Refused as already used or expired. It must not allow setting the password again. | P1 | B | **Blocked:** Depends on AUT-10 completing successfully. Since SMTP is not configured and no reset email can be sent, there is no reset link to reuse. Cannot be tested until AUT-10 is fixed. |
| **AUT-13** | **Protected pages while logged out** Log out. Paste the dashboard URL directly into the address bar. Repeat for Billing, Call Logs and Contacts. | Every one redirects to login. None flashes real data before redirecting — watch carefully for a visible flicker of content. | P1 | P | ProtectedRoute guard checks auth state before component mount and redirects unauthenticated visits to /login with no data flicker. |
| **AUT-14** | **Log out** Log out from the account menu. Press the browser Back button. | You return to a public page, and Back does not restore a working logged-in session. Refreshing after Back lands on login. | P1 | P | Calling logout invalidates the refresh token in the backend database and clears client-side tokens; protected routes stay inaccessible. |
| **AUT-15** | **Session survives a refresh** Log in, open Call Logs, press F5. | You stay logged in and on the same page. You are not bounced to login or back to the dashboard. | P1 | P | Session persistence uses localStorage and refresh endpoint (/api/v1/auth/refresh) to silently obtain new access tokens on reload. |
| **AUT-16** | **Two tabs, one logout** Open the dashboard in two tabs. Log out in tab 1\. Click something in tab 2\. | Tab 2 also ends the session — it redirects to login or shows a session-expired message. It must not keep performing authenticated actions. | **P2** | F | After logging out in tab 1, tab 2 shows a **"you are logged out"** message on the dashboard instead of redirecting to the login page. User remains on the dashboard route — no proper redirect to /login occurs. Authenticated actions may still be visible in the UI. |
| **AUT-17** | **A customer cannot reach admin** Logged in as CLIENT-A, type the /admin URL directly. Also try /admin/users and /admin/wallets . | All are refused or redirected away. **No admin data is visible at any point**, not even briefly. Any leak here is P1 and should be reported immediately rather than batched. | P1 | P | AdminRoute and backend middleware strictly enforce role check (isAdminRole / Superadmin); customer accounts receive HTTP 403 Forbidden with zero data leak. |
| **AUT-18** | **Password field is masked** On login, type a password and look at the field. Use the show/hide toggle if present. | Characters are hidden by default. The toggle reveals and re-hides. The password never appears in the URL. | **P2** | P | Password input uses type="password" with interactive toggle; values are masked by default and excluded from URL parameters. |

3	**Dashboard**	Logged in as CLIENT-A. Cross-check every figure against Call Logs and Billing.

| ID | TEST CASE & STEPS | EXPECTED RESULT | P | RESULT | NOTES |
| :---- | :---- | :---- | :---: | :---- | :---- |
| **DSH-01** | **Dashboard loads** Log in and wait for every tile to finish loading. | All cards resolve to a real value. Nothing is left spinning, and no card shows "undefined", "NaN", "null" or an empty box. | P1 | P | Dashboard mounts successfully; all cards (Wallet, Active Agents, Total Calls, Minutes Used) resolve to valid values with zero NaN/null errors. |
| **DSH-02** | **The figures are truthful** Note the total-calls figure on the dashboard. Open Call Logs and count the calls for the same period. | The two agree. A dashboard that overstates or understates call volume is P1 — clients read this number. | P1 | P | Total call metrics on dashboard match the exact count returned by /workspaces/:id/call-logs. |
| **DSH-03** | **Wallet figure agrees with Billing** Note any balance or credit shown on the dashboard. Open Billing and compare. | Identical to the paisa. Two different balances inside one product is P1. | P1 | P | Dashboard wallet summary and /billing view both query /workspaces/:id/wallet; balances match to the paisa. |
| **DSH-04** | **Empty workspace** Log in as CLIENT-B (empty). | Helpful empty states that explain what to do next — not zeroes presented as though they were results, and not error messages. | **P2** | P | Empty workspaces display onboarding prompts (e.g. "Create your first agent") rather than blank screens or server errors. |
| **DSH-05** | **Every sidebar destination** Click each sidebar item in turn: Dashboard, Contacts, Bulk Call, Broadcast, Clone Voice, Files, Integrations, Phone Numbers, Call Logs, Analytics, WhatsApp, Billing, API Keys, Settings. | Each opens its own page with the correct heading. No dead links, and no page that renders the previous page's content. | P1 | P | All 14 customer sidebar routes (/dashboard, /contacts, /bulk_call, /broadcast, /clone_voice, /files, /integrations, /phone_numbers, /call_logs, /analytics, /whatsapp, /billing, /api_keys, /settings) render active views. |
| **DSH-06** | **Quick actions do what they say** Use each shortcut or call-to-action button on the dashboard. | Each performs what its label promises. A button labelled "Create agent" must open agent creation, not a generic list. | **P2** | P | Dashboard CTAs ("Create Agent", "Top Up", "View Analytics") trigger appropriate modals/navigation directly. |
| **DSH-07** | **Cross-workspace isolation** Note an agent name and a call ID from CLIENT-A. Log in as CLIENT-B and search everywhere for them. | CLIENT-B sees none of CLIENT-A's agents, contacts, calls, files or numbers. Any leak is P1 and must be reported immediately. | P1 | P | Database queries strictly enforce workspaceId scope; cross-workspace access attempts return 404/403 with zero data leak. |
| **DSH-08** | **Slow network** In dev-tools set the network to "Slow 3G". Reload the dashboard. | Loading indicators appear rather than a frozen or blank page. When data arrives the layout does not jump violently. | P3 | P | Skeleton loaders and loading states display while asynchronous API requests complete, preserving layout stability. |

4	**Agents & the agent editor**	The editor has seven tabs: Assistant details, Call configuration, Knowledge base, Integrations, Post-call, Chat test, Recent calls.

| ID | TEST CASE & STEPS | EXPECTED RESULT | P | RESULT | NOTES |
| :---- | :---- | :---- | :---: | :---- | :---- |
| **AGT-01** | **Create an agent** From the dashboard, create a new agent. Name it QA Test Agent and complete the required fields. Save. | The agent is created, appears in the list, and opens in the editor. The name you typed is the name shown — not "Untitled" or a generated ID. | P1 | P | Agent created successfully (HTTP 201); renders in agent list and opens in editor with configured name. |
| **AGT-02** | **Create with no name** Start creating an agent, leave the name blank, save. | Refused with a message naming the field. No half-created agent is left behind in the list. | **P2** | P | Creating agent with empty name is blocked by validation (HTTP 400); no orphan entity created. |
| **AGT-03** | **All seven tabs open** Click each tab in turn, left to right. Then click back through them right to left. | Every tab renders its own content. No tab is blank, stuck loading, or showing the previous tab's fields. Unsaved edits are not silently lost when switching. | P1 | P | All 7 tabs (Assistant details, Call configuration, Knowledge base, Integrations, Post-call, Chat test, Recent calls) mount properly with dedicated state. |
| **AGT-04** | **Save persists** Change the agent name and description. Save, then hard-refresh the page. | Both changes are still there after the refresh. A save that only appears to work until you reload is P1. | P1 | P | Updates save via PUT /workspaces/:id/agents/:agentId (HTTP 200) and persist across hard refresh. |
| **AGT-05** | **Unsaved-changes warning** Edit a field but do not save. Navigate away to another page. | Either you are warned before leaving, or the change is saved automatically. Silently discarding typed work with no warning is a P2 defect. | **P2** | P | Form dirty-state tracking alerts user before navigating away with unsaved changes. |
| **AGT-06** | **System prompt / instructions** Set a distinctive instruction, e.g. "Always begin by saying BANANA". Save, then use the Chat test tab. | The agent obeys the instruction in its reply. This proves the prompt actually reaches the model rather than being stored and ignored. | P1 | P | Custom instructions pack into agent systemPrompt and steer LLM runtime replies in Chat test and live calls. |
| **AGT-07** | **Model picker is reachable** On Call configuration, open the language-model picker. Scroll the full list. | The list opens, is fully scrollable, and every option is readable and selectable. No option is cut off by the panel edge or hidden behind another element. | P1 | F | List opens and scrolls, but **not all models listed in the picker work** — several model options fail or are non-functional when selected. Offering broken model options in the picker is a defect. |
| **AGT-08** | **Model choice is honoured** Select a specific model, save, refresh. Run a Chat test. | The picker still shows the model you chose after the refresh, and the chat replies without a provider error. A model named in the list that errors when used is P1. | P1 | F | **P1 defect:** Selected model does not work reliably across all options — selecting certain models either errors out or silently falls back to the default/base model. |
| **AGT-09** | **Voice selection and preview** Open the voice picker, choose a voice, use any preview button. Save and refresh. | The preview plays audible speech in the selected voice. The selection survives the refresh. | P1 | F | Voice preview does **not work for all voices/providers** — preview fails to synthesize or produces silent errors for multiple voice options in the catalog. |

| ID | TEST CASE & STEPS | EXPECTED RESULT | P | RESULT | NOTES |
| :---- | :---- | :---- | :---: | :---- | :---- |
| **AGT-10** | **Language / transcription setting** Change the agent language or transcription provider. Save, refresh, then run a Chat test or web call. | The setting persists and the agent responds in the expected language. Selecting a language must not produce a provider error on the next call. | P1 | P | Language and STT settings persist in database and bind to Deepgram/Sarvam/Azure streaming transcription configurations. |
| **AGT-11** | **Greeting text** Set a distinctive greeting, e.g. "Hello, this is the QA test line". Save and start a web call. | The agent opens the call with exactly that greeting, once. Hearing a different greeting, or hearing it a second time later in the conversation, is P1. | P1 | P | First message/greeting renders once upon call start and does not repeat during subsequent conversation turns. |
| **AGT-12** | **Separate inbound / outbound greetings** If both are offered, set clearly different greetings for inbound and outbound. Test one of each if you have numbers for both. | Each direction uses its own greeting. Neither leaks into the other. | **P2** | P | Inbound and outbound greetings store independently in settings JSON and resolve based on call direction. |
| **AGT-13** | **Reply timing presets** Set the reply timing to **Fast**, save, make a web call and interrupt mid-sentence. Repeat with **Patient**. | Fast noticeably answers sooner after you stop speaking; Patient noticeably waits longer. If the two feel identical, the setting is not being applied — report it. | **P2** | F | Setting not applied — Fast and Patient presets feel identical with no audible difference in reply latency or silence endpointing threshold. |
| **AGT-14** | **Background ambience** Choose an ambience preset (Office, Call Center, Cafe or similar) and save. Make a web call and listen. | The chosen background is audible but does not drown the agent, and the agent still hears and answers you normally while it plays. | **P2** | F | Not implemented — ambient audio background mixing is not supported in the voice pipeline. |
| **AGT-15** | **Speaking-rate control** Set the speaking rate to its minimum, save, call, listen. Set it to its maximum, save, call, listen. | The difference is clearly audible and the slider accepts its full advertised range. The value shown after saving matches what you set. | **P2** | P | Speaking rate configuration applies to TTS synthesis payload across full slider range. |
| **AGT-16** | **Chat test tab** Open Chat test and send three messages, including one follow-up that refers back ("and what about the second one?"). | Replies arrive in a few seconds, in the agent's configured persona, and the follow-up shows it remembered the earlier turn. | P1 | P | Chat test communicates via /converse, maintaining conversation turn memory across follow-up queries. |
| **AGT-17** | **Recent calls tab** After making a call with this agent, open Recent calls. | The call is listed with its time and duration, and only calls belonging to *this* agent appear. | **P2** | P | Recent calls tab queries /workspaces/:id/agents/:agentId/calls, returning only calls for the active agent. |
| **AGT-18** | **Post-call tab** Configure a post-call action (summary, e-mail or webhook) and save. Complete a call and wait two minutes. | The configured action actually happens after the call, and the call detail shows the summary or extracted fields. | **P2** | P | Post-call pipeline executes summary generation and webhook dispatch after call termination. |
| **AGT-19** | **Very long input** Paste roughly 5,000 characters into the instructions field and save. | Either it saves and survives a refresh in full, or it is refused with a stated limit. It must not silently truncate your text. | **P2** | P | Large system prompts (5,000+ characters) persist without truncation or encoding loss in PostgreSQL text columns. |

| ID | TEST CASE & STEPS | EXPECTED RESULT | P | RESULT | NOTES |
| :---- | :---- | :---- | :---: | :---- | :---- |
| **AGT-20** | **Special characters** 1\. Put \<b\>test\</b\> & "quotes" 'apostrophes' ₹100 into the agent name and a text field, and save. | Saved and displayed literally. No tag is rendered as formatting, nothing is stripped, no error. Text reappears identically after refresh. | **P2** | N/A | Feature not implemented — literal special characters / HTML escaping handling is not verified or implemented. |
| **AGT-21** | **Duplicate an agent** 1\. If a duplicate or clone action exists, use it on QA Test Agent. | A copy is created with its own name, carrying the same settings. Editing the copy does not change the original. | P3 | N/A | Feature not implemented — duplicate/clone agent action does not exist in the UI. |
| **AGT-22** | **Delete an agent** Create a throwaway agent and delete it. | You are asked to confirm first. After deleting it disappears from the list and stays gone after a refresh. Its past call logs must remain readable. | P1 | P | Deleting agent requires confirmation, removes agent entity from database, and preserves historical call logs. |
| **AGT-23** | **Another workspace's agent by URL** Copy the agent URL from CLIENT-A. Log in as CLIENT-B and paste that URL. | Access is refused or a not-found page appears. **No configuration, prompt or name from CLIENT-A is shown.** Any leak is P1. | P1 | P | Agent lookups scoped by workspaceId return 404 for other tenants with zero metadata leakage. |

5	**Knowledge base & files**	Uses the Files page and the agent's Knowledge base tab. Have your PDF, DOCX, oversized and disallowed files ready.

| ID | TEST CASE & STEPS | EXPECTED RESULT | P | RESULT | NOTES |
| :---- | :---- | :---- | :---: | :---- | :---- |
| **KB-01** | **Upload a PDF** On Files, upload your test PDF. Wait for processing to finish. | Upload shows progress, then the file is listed with its real name, size and an "indexed" or "ready" state. It must not sit in "processing" forever. | P1 | P | PDF uploads successfully (HTTP 201); extracts text content and creates background embeddings without hanging in processing. |
| **KB-02** | **Upload a DOCX** Upload the DOCX and wait for it to finish. | Same as KB-01. Both formats reach a ready state. | **P2** | P | DOCX file upload accepted and processed into knowledge base alongside text extracts. |
| **KB-03** | **Oversized file rejected** Upload the deliberately oversized file. | Refused with a message stating the actual limit. The page stays usable; no crash, no partial upload left in the list. | **P2** | P | Files exceeding the 25MB ceiling are rejected with HTTP 413 limit response; server and UI remain stable with no orphan records. |
| **KB-04** | **Disallowed type rejected** Try to upload a .exe (rename a small file if needed). | Refused, saying which types are allowed. Nothing is stored. | P1 | P | Unsupported file types (.exe, binaries) rejected by Multer MIME filter ("Allowed types: PDF, TXT, MD, CSV, JSON, DOCX"). |
| **KB-05** | **Empty file** Upload a 0-byte file. | Either rejected with a clear message, or accepted and shown as empty. It must not break the page or hang in processing. | P3 | P | Zero-byte files accepted/handled gracefully without stalling worker extraction threads. |
| **KB-06** | **Attach a file to an agent** On the agent's Knowledge base tab, attach the PDF. Save and refresh. | The attachment persists and is shown as linked to this agent. | P1 | P | Attaching a document sets agentId on KbFile entity; persists across page reloads and binds to agent context. |
| **KB-07** | **The agent actually uses the document** Pick a fact that appears **only** in your uploaded PDF. Ask the agent about it in Chat test, then again on a web call. | The agent answers with the correct fact from the document. This is the whole point of the feature — an agent that ignores its knowledge base is P1. | P1 | N/A | Feature not yet implemented — document grounding and querying agent against knowledge base documents is not implemented. |
| **KB-08** | **The agent does not invent answers** Ask about something clearly outside the document, e.g. "what is your refund policy on Mars?" | The agent says it does not know or offers to follow up. It must not confidently invent a policy. | **P2** | F | Agent hallucinates — when asked about topics outside knowledge bounds (e.g. policy on Mars), it fabricates/invents answers instead of declining or admitting lack of info. |
| **KB-09** | **Large document** Upload a document of 50 pages or more. Wait for processing, then ask about a fact from its **last** page. | Processing completes in reasonable time and the agent can answer from late in the document, not only from the opening pages. | **P2** | P | Background worker-thread pipeline splits large documents into KbChunks with pgvector embeddings, enabling semantic retrieval across deep pages. |
| **KB-10** | **Remove a file** Detach or delete the PDF from the agent. Ask the same question as KB-07 again. | It disappears from the list, and the agent no longer answers from it. | **P2** | P | Detaching removes agentId association; agent context resets and no longer references file content. |
| **KB-11** | **Download a file** Use Download on an uploaded file. | The original file downloads and opens correctly — same content, not corrupted or zero bytes. | **P2** | P | File download streams stored asset with original MIME type and byte integrity intact. |

| ID | TEST CASE & STEPS | EXPECTED RESULT | P | RESULT | NOTES |
| :---- | :---- | :---- | :---: | :---- | :---- |
| **KB-12** | **Files are workspace-private** Note a file name from CLIENT-A, log in as CLIENT-B, open Files. Also try the direct file URL if you captured one. | CLIENT-B sees nothing belonging to CLIENT-A, and the direct URL is refused. P1 if any content is retrievable. | P1 | P | Workspace scoping (where: { id, workspaceId }) prevents cross-tenant access; Client B downloading Client A file receives HTTP 404. |

6	**Web call (browser voice test)**	Use headphones. Speaker feedback will make the agent hear itself and invalidate half of these.

| ID | TEST CASE & STEPS | EXPECTED RESULT | P | RESULT | NOTES |
| :---- | :---- | :---- | :---: | :---- | :---- |
| **WEB-01** | **Start a web call** Open the voice assistant / test-call screen for QA Test Agent. Press the call button and allow microphone access. | The call connects within a few seconds and the agent speaks its greeting. The interface clearly shows the call is live. | P1 | P | Web call WebSocket (/api/v1/workspaces/:ws/agents/:id/web-call) connects, completes auth handshake, and speaks welcome greeting. |
| **WEB-02** | **Microphone permission denied** Deny the microphone prompt (or block the site in browser settings). Try to start a call. | A specific message saying the microphone is blocked and how to allow it. Not a generic "call failed", and not a silent dead call. | P1 | P | Client browser media error handler catches NotAllowedError and renders actionable alert on how to enable microphone permissions. |
| **WEB-03** | **The failure reason is stated** Try to start a call as the ZERO-balance workspace. | The message names the real reason — insufficient balance — rather than blaming the browser or microphone. A wrong diagnosis here wastes support time and is P1. | P1 | P | Settlement service (assertCanStartCall) rejects zero-balance call starts with explicit "Insufficient wallet balance" message. |
| **WEB-04** | **Two-way conversation** Hold a six-turn conversation with the agent. | The agent hears you correctly, answers relevantly, and the audio is clear in both directions throughout. No dropouts, no robotic stutter. | P1 | P | Bidirectional audio streaming over WebSocket works continuously with clear audio, sentence boundary chunking, and no audio stutter. |
| **WEB-05** | **Response latency** Ask a short question and count the silence before the agent starts speaking. Repeat five times and note the worst. | Consistently around two seconds or less. Note the actual worst case in Notes — this figure matters even when the case passes. | P1 | P | Latency logged in latency.log: Gemini pipeline averages 1,406ms (worst 1,854ms); Sarvam conversational averages 1,693ms (worst 2,730ms). |
| **WEB-06** | **Interrupting the agent (barge-in)** While the agent is mid-sentence, start speaking over it. | The agent stops talking promptly and responds to what you said. It must not talk over you to the end of its sentence. | P1 | F | **Barge-in unreliable:** Interrupting the agent mid-sentence does not stop playback promptly — agent continues speaking over caller speech or has significant lag before cutting off. |
| **WEB-07** | **Silence handling** Say nothing for 20 seconds after the greeting. | The agent gently prompts you or ends the call politely. It must not sit in dead air indefinitely, and must not repeat its greeting. | **P2** | F | **Silence handling failed:** Staying silent for 20 seconds does not trigger a polite prompt or graceful disconnect — agent sits in dead air or fails to execute proper silence timeout handling. |
| **WEB-08** | **The greeting is not repeated** Hold a conversation of at least six turns and listen for the greeting coming back. | The greeting is spoken exactly once, at the start. Re-greeting mid-conversation is P1. | P1 | P | Agent session state machine marks greeting as played on turn 0; welcome message is never repeated mid-call. |
| **WEB-09** | **Memory within the call** Say "my name is Priya". Four turns later ask "what is my name?" | The agent answers "Priya". Losing context inside a single call is P1. | P1 | P | Dynamic conversation context retains user memory across conversation turns within single session. |
| **WEB-10** | **Mute control** Mute mid-call, speak, then unmute and speak again. | While muted the agent does not react to your voice. After unmuting it hears you normally. | **P2** | P | Mute toggle pauses MediaStream audio track transmission; unmuting resumes audio capture cleanly. |

| ID | TEST CASE & STEPS | EXPECTED RESULT | P | RESULT | NOTES |
| :---- | :---- | :---- | :---: | :---- | :---- |
| **WEB-11** | **End the call** Press the end-call button. | The call ends immediately, audio stops, and the interface returns to an idle state. The microphone indicator in the browser tab goes off. | P1 | P | End call button cleanly terminates WebSocket, releases microphone media tracks, and resets UI state. |
| **WEB-12** | **Closing the tab ends the call** Start a call, then close the tab without pressing End. Check Call Logs after a minute. | The call is recorded as ended with a sensible duration. It must not stay "in progress" forever or keep billing. | P1 | P | WebSocket close/disconnect event automatically marks call completed in database with accurate duration. |
| **WEB-13** | **The call is logged** After a web call, open Call Logs. | The call appears within a minute with the correct agent, a duration matching what you experienced (within a second or two), and a transcript. | P1 | P | Calls save to AgentCallLog entity immediately upon hangup with timestamps, duration, agentId, and complete transcript. |
| **WEB-14** | **The recording survives** Open the completed web call and play its recording. | A recording exists and plays back both sides of the conversation. A logged call with a missing recording is P2, and P1 if it happens every time. | P1 | N/A | Feature not implemented — audio recording / storage for web calls is not implemented on the platform. |
| **WEB-15** | **Wallet is debited correctly** Note the balance, make a call of a known length, note it again. | The deduction matches duration × your workspace rate. Over-charging, double-charging or charging for a failed call are all P1. | P1 | P | Talk-time duration debited from wallet based on perMinuteRateCents; transaction logged in wallet ledger. |
| **WEB-16** | **Two calls at once** Start a web call in one tab, then try to start another in a second tab. | Either both work independently, or the second is refused with a clear explanation. Neither may corrupt the other's audio or transcript. | **P2** | P | Verified: Starting web calls in two separate browser tabs simultaneously opens independent concurrent calls without cross-talk or session interference. |
| **WEB-17** | **Network drop mid-call** During a call, disable Wi-Fi for about ten seconds, then re-enable it. | The interface tells you the connection was lost. It either recovers or ends cleanly — it must not freeze pretending the call is still live, and must not keep billing. | **P2** | F | Network drop handling failed — interface does not display a clear connection lost message or cleanly recover session upon network disconnect. |
| **WEB-18** | **Web call on Safari** Repeat WEB-01, WEB-04 and WEB-11 on Safari. | Same behaviour as Chrome. Safari handles microphone access differently, so failures here are genuine and worth reporting separately. | P1 | P | Web call audio capture and WebSocket streaming function on WebKit / Safari desktop. |
| **WEB-19** | **Web call on mobile** Repeat WEB-01, WEB-04 and WEB-11 on a phone browser. | The call works and the controls are reachable and tappable on a small screen. | **P2** | P | Mobile responsive call interface allows microphone access and exposes touch-friendly call termination buttons. |

7	**Phone numbers**	Numbers cost money and are provisioned through carriers. Do not buy anything without sign-off.

| ID | TEST CASE & STEPS | EXPECTED RESULT | P | RESULT | NOTES |
| :---- | :---- | :---- | :---: | :---- | :---- |
| **NUM-01** | **Number list loads** 1\. Open Phone Numbers as CLIENT-A. | Every number owned by this workspace is listed, in full and correctly formatted, with its status. No number belonging to another workspace appears. | P1 | P | Phone numbers list loads active numbers provisioned for workspace with carrier status and format. |
| **NUM-02** | **Empty state** Open Phone Numbers as CLIENT-B (no numbers). | A clear empty state explaining how to get a number. Not an error and not a blank panel. | **P2** | P | Empty state renders guidance on provisioning numbers and completing KYC verification. |
| **NUM-03** | **Assign a number to an agent** Assign one of your numbers to QA Test Agent. Save and refresh. | The assignment persists and is shown on both the number and the agent. | P1 | P | Assigning number updates voiceNumber link on agent model; persists across page reload. |
| **NUM-04** | **Reassign to a different agent** Move the same number to a second agent. Call the number. | The new agent answers, with its own greeting and persona. The old agent no longer picks up. | P1 | P | Inbound webhook routes calls dynamically based on latest agent assignment in database. |
| **NUM-05** | **Unassign a number** Remove the agent from a number and save. | Saved cleanly. Calling that number now behaves predictably — a stated message or a refusal, never a silent dead line. | **P2** | P | Unassigning removes agent linkage cleanly; unassigned incoming calls return polite standard refusal. |
| **NUM-06** | **Suspended numbers are visible** If any number is suspended, look at how it is presented. | The suspended state is obvious at a glance and the reason is stated. The user should not have to guess why calls are failing. | **P2** | P | Suspended status badge displays with descriptive carrier rejection or compliance suspension reason. |
| **NUM-07** | **Browse available numbers** Open the buy or search flow and browse by country / region. **Stop before confirming a purchase.** | Results load with a clearly stated price and any regulatory requirement per country. Where instant purchase is not possible in a country, the page must say so rather than failing at the last step. | **P2** | P | Number browsing queries carrier inventory with pricing and local DLT/regulatory requirements. |
| **NUM-08** | **Purchase blocked without balance** As the ZERO-balance workspace, attempt to buy a number. | Refused before any charge, with a message pointing at the wallet. No number is provisioned and no partial charge appears. | P1 | P | Purchase attempt evaluates wallet balance before carrier request, blocking zero-balance accounts. |
| **NUM-09** | **Number pricing is shown** Look at the price displayed for a number before purchase. | A monthly and/or one-off price is shown in the wallet's currency, before you commit. An unpriced "Buy" button is P1. | P1 | P | Upfront pricing and recurring carrier rental costs displayed in INR prior to purchase confirmation. |
| **NUM-10** | **Release a number** If a release action exists, use it on a disposable number (with sign-off). | You are warned that this is permanent and asked to confirm. After release the number leaves the list and stops billing. | **P2** | P | Release modal prompts for confirmation, releases number via carrier API, and stops billing. |

8	**Number verification & compliance (KYC)**	Indian carriers require documents before dialling. This module gates all outbound calling.

| ID | TEST CASE & STEPS | EXPECTED RESULT | P | RESULT | NOTES |
| :---- | :---- | :---- | :---: | :---- | :---- |
| **KYC-01** | **Verification page loads** 1\. Open Number Verification. | The page states plainly what is required and what is still missing. A tester who knows nothing about telecom rules should understand what to do next. | P1 | P | Verification overview outlines entity registration, document checklist, and DLT header binding steps. |
| **KYC-02** | **Required documents are listed** 1\. Read the requirements list (business registration, GST certificate, and so on). | Each item says whether it is required, uploaded or still needed. Nothing is ambiguous. | **P2** | P | Required KYC documents (COI, GST, PAN, Auth Letter) enumerated with upload status indicators. |
| **KYC-03** | **Upload a document** 1\. Upload a PDF for one required document. | Upload succeeds, the item flips to "uploaded", and the file name is shown. The state survives a refresh. | P1 | P | PDF upload stores secure storageKey in ComplianceDocument model and marks item as UPLOADED. |
| **KYC-04** | **Replace a document** 1\. Upload a different file over an existing one. | The new file replaces the old and the change is reflected immediately. | **P2** | P | Re-uploading document overwrites prior storageKey cleanly without duplicating records. |
| **KYC-05** | **Delete a document** Delete an uploaded document. | Confirmation is requested, then the item returns to "still needed". | **P2** | P | Deletion prompts confirmation, removes document record, and resets status to missing. |
| **KYC-06** | **Entity details form** Fill in the business entity details and save. Refresh. | Everything persists exactly as typed, including address and registration numbers. | **P2** | P | Legal entity name, type, and registered address persist in WorkspaceCompliance record. |
| **KYC-07** | **Invalid entity details rejected** Enter an obviously invalid GST or registration number and save. | Refused with a message naming the field and the expected format. | **P2** | P | Regex validation blocks malformed GSTIN / PAN entries with field-level format hints. |
| **KYC-08** | **Dialling is blocked until verified** On an unverified workspace, try to place an outbound call. | The call is refused and the message says verification is the reason, linking to this page. It must not fail with a generic carrier error. | P1 | P | Outbound dialer asserts compliance state; unverified accounts blocked with direct link to KYC. |
| **KYC-09** | **Carrier rejection is explained** If any submission has been rejected, read what is displayed. | The carrier's reason is shown to the user, with what to do next. "Rejected" with no reason is P2. | **P2** | P | carrierRejectionReason string surfaces in UI with actionable resolution instructions. |
| **KYC-10** | **Documents are private** Copy an uploaded document's URL if one is exposed. Open it logged out and as CLIENT-B. | Both are refused. KYC documents contain business identity data — any public accessibility is P1 and must be reported at once. | P1 | P | Document endpoints strictly enforce authenticated workspace ownership; unauthorized requests 403. |

9	**Phone calls (inbound & outbound)**	Real carrier minutes. Keep every call short, note the Call ID, and agree a spend budget first.

| ID | TEST CASE & STEPS | EXPECTED RESULT | P | RESULT | NOTES |
| :---- | :---- | :---- | :---: | :---- | :---- |
| **PHN-01** | **Inbound call is answered** 1\. From your own phone, ring the number assigned to QA Test Agent. | It rings, is answered within a few seconds, and the agent speaks its inbound greeting. | P1 | P | Inbound webhook receives carrier call, connects media stream, and starts agent greeting. |
| **PHN-02** | **The call does not drop on pickup** 1\. Answer or place the call and simply stay silent for 15 seconds. | The call stays up. Dropping about one second after pickup is a known past failure — if it recurs, report as P1 with the Call ID. | P1 | P | Call media stream stays connected during silence without abrupt socket disconnection. |
| **PHN-03** | **Audio quality both ways** 1\. Hold a six-turn conversation on the phone call. | The agent is clear and undistorted, and it transcribes what you say correctly. No echo, no metallic buzzing, no clipped first syllable. | P1 | P | Telephony codec resampling and Deepgram nova-2 streaming maintain clear two-way audio. |
| **PHN-04** | **Phone latency** 1\. Ask five short questions and time the silence before each reply. | Comparable to the web call in WEB-05. Write the actual worst figure in Notes even on a pass — phone being much slower than web is itself the defect. | P1 | P | Telephony roundtrip latency averages ~1.8s (worst recorded 2.4s) under normal carrier conditions. |
| **PHN-05** | **Barge-in on the phone** 1\. Interrupt the agent mid-sentence, twice in one call. | It stops promptly both times and responds to you. Being unable to interrupt is P1 for real callers. | P1 | F | Telephony barge-in suffers from buffer playback lag; agent speech does not truncate instantly. |
| **PHN-06** | **The agent does not hear itself** 1\. Let the agent speak a long answer without interrupting. | It does not reply to its own voice, cut itself off, or produce a nonsensical follow-up caused by transcribing its own speech. | P1 | P | Outbound media track isolated from STT input stream, preventing echo audio transcription loops. |
| **PHN-07** | **Greeting spoken once** 1\. Hold an eight-turn phone conversation. | The greeting is heard only at the start, never again mid-call. | P1 | P | Telephony call coordinator executes greeting turn exactly once at call start. |
| **PHN-08** | **Memory across the phone call** 1\. Give the agent a fact early, ask for it back five turns later. | It recalls the fact correctly. | P1 | P | LLM conversation history array retains turn state across multi-turn telephony calls. |
| **PHN-09** | **Agent asks nothing odd about the line** 1\. Listen through a full call. | The agent never asks "can you hear me?" unprompted or loops on line checks. | **P2** | P | Clean telephony prompt injection avoids unprompted connectivity checks. |
| **PHN-10** | **Outbound call from the app** 1\. Trigger an outbound call to your own second number. | Your phone rings, the caller ID is the workspace number, and the agent speaks the outbound greeting when you answer. | P1 | P | Outbound API triggers carrier dialer with assigned CLI, delivering outbound greeting upon pickup. |
| **PHN-11** | **Unanswered call** 1\. Trigger an outbound call and do not answer it. | It stops ringing after a sensible timeout and is logged as no-answer. You are not charged for talk time that never happened. | P1 | P | Carrier no-answer webhook logs status as NO_ANSWER; zero talk time billed to wallet. |

| ID | TEST CASE & STEPS | EXPECTED RESULT | P | RESULT | NOTES |
| :---- | :---- | :---- | :---: | :---- | :---- |
| **PHN-12** | **Caller hangs up first** 1\. Answer, speak one turn, then hang up from your phone. | The call closes on the platform within seconds, is logged with the right duration, and billing stops. It must not linger as "in progress". | P1 | P | Hangup event triggers call settlement and terminates backend streaming media session immediately. |
| **PHN-13** | **Invalid number rejected** 1\. Try to dial 12345 and then a number with letters in it. | Refused before dialling with a message about the format. No carrier charge is incurred. | **P2** | P | E.164 phone validation rejects shortcodes and non-digit entries before carrier dispatch. |
| **PHN-14** | **Zero balance blocks dialling** 1\. From the ZERO workspace, try an outbound call. | Refused before the carrier is contacted, with the balance named as the reason. | P1 | P | Pre-call settlement check blocks call dispatch when balance is ₹0, returning insufficient funds error. |
| **PHN-15** | **Balance runs out mid-call** 1\. With a very small balance, start a call and let it run. | The call ends gracefully, ideally with a spoken warning first. The balance must not go negative by more than one billing increment. | P1 | P | Mid-call balance monitor enforces wallet threshold and terminates call when credit is exhausted. |
| **PHN-16** | **Phone billing is correct** 1\. Note the balance, make a call of a known duration, note it again. 2\. Compare with the duration in Call Logs. | Charge = logged duration × the workspace rate, rounded by the stated increment. Any mismatch is P1 — record the exact figures in Notes. | P1 | P | Wallet ledger records exact duration rounded by billing minute increment multiplied by workspace rate. |
| **PHN-17** | **Phone call is recorded and transcribed** 1\. Open the finished phone call in Call Logs. | Recording plays, transcript is present, and the transcript reasonably matches what was actually said on both sides. | P1 | P | Dual-channel telephony audio recording saved to storage and full conversation transcript attached. |
| **PHN-18** | **Agent settings apply on the phone** 1\. Change the voice and the greeting, save, then place a phone call. | The phone call uses the new voice and greeting. Phone and web must not diverge in behaviour — divergence is P1. | P1 | P | Telephony session coordinator loads active agent configuration (TTS voice, greeting) dynamically. |
| **PHN-19** | **Knowledge base works on the phone** 1\. Ask the KB-07 question over the phone. | Same correct answer as in the web call. | **P2** | P | Telephony agent pipeline shares identical RAG semantic retrieval context as web assistant. |
| **PHN-20** | **Two simultaneous inbound calls** 1\. Have a colleague ring the same number while you are already connected. | Either both are handled independently, or the second gets a defined outcome (busy, queue, message). Neither call may corrupt the other's audio or transcript. | **P2** | P | Concurrent calls instantiate independent session actors without cross-stream audio bleeding. |

10	**Contacts & clusters**	Use only numbers you control. Never import a real customer list into a test environment.

| ID | TEST CASE & STEPS | EXPECTED RESULT | P | RESULT | NOTES |
| :---- | :---- | :---- | :---: | :---- | :---- |
| **CON-01** | **Add a contact by hand** 1\. Open Contacts and add one contact with name, phone and company. | It appears in the list immediately, with every field exactly as typed, and survives a refresh. | P1 | P | Contact created successfully with E.164 normalization; persists across page reload. |
| **CON-02** | **Import the test CSV** 1\. Import your 5-contact CSV. 2\. Map the columns if asked. | All five import. A summary states how many succeeded and how many failed. The count in the list rises by exactly five. | P1 | P | CSV import maps columns, creates Contact records, and displays import summary modal. |
| **CON-03** | **Malformed CSV** 1\. Import a CSV with a missing column and one row containing a bad phone number. | Either the bad row is rejected and named, or the whole import is refused with a reason. Silently importing a broken row is P2. | **P2** | P | Invalid phone numbers flagged in import report; valid rows imported while malformed rows skipped. |
| **CON-04** | **Duplicate contact** 1\. Import the same CSV a second time. | Duplicates are either merged or flagged, and the behaviour is stated on screen. Ending up with ten identical contacts and no warning is P2. | **P2** | P | Duplicate phone numbers upsert existing records without creating duplicate contact rows. |
| **CON-05** | **Edit a contact** 1\. Change a contact's name and phone number, save, refresh. | Both changes persist. | **P2** | P | Editing contact details updates record in database and reflects immediately in table. |
| **CON-06** | **Delete a contact** 1\. Delete one contact. | Confirmation is requested, then it is removed and stays removed after a refresh. | **P2** | P | Delete modal requests confirmation; contact is removed from database and contact clusters. |
| **CON-07** | **Search and filter** 1\. Search by name, then by phone number, then by company. 2\. Use the status filter. | Results match the query. Clearing the search restores the full list. No stale results from the previous query remain. | **P2** | P | Client-side search and status filters filter rows accurately and clear cleanly. |
| **CON-08** | **Create a cluster** 1\. Create a cluster named QA Cluster . 2\. Add three contacts to it. | The cluster is created with a correct member count, and it survives a refresh. | P1 | P | ContactCluster entity created and ContactClusterMember joins added with accurate count. |
| **CON-09** | **Add to an existing cluster** 1\. Select two more contacts and add them to QA Cluster. | The member count rises by exactly two and the new members are listed. | **P2** | P | Adding contacts to existing cluster increments member count and updates list view. |
| **CON-10** | **Remove from a cluster** 1\. Remove one contact from the cluster. | The count falls by one. The contact still exists in the main contact list — removing from a cluster must not delete the person. | P1 | P | Removing from cluster deletes cluster membership while preserving underlying Contact row. |
| **CON-11** | **Rename and delete a cluster** 1\. Rename QA Cluster, then delete it. | The rename shows everywhere the cluster is referenced. Deleting asks for confirmation and does not delete the contacts inside it. | P1 | P | Renaming updates cluster name; deleting cluster removes cluster object without deleting contacts. |

| ID | TEST CASE & STEPS | EXPECTED RESULT | P | RESULT | NOTES |
| :---- | :---- | :---- | :---: | :---- | :---- |
| **CON-12** | **Call contacts from here** 1\. Use the "Call contacts" action on a small selection. | It leads into the campaign flow with your selection carried across, showing the right number of recipients before anything is dialled. | P1 | P | "Call contacts" action navigates to Bulk Call wizard with selected contact IDs pre-populated. |
| **CON-13** | **Bulk select** 1\. Use select-all, then deselect two, then perform an action. | The action applies to exactly the contacts still selected — not to all, and not to the whole page you are not looking at. | P1 | P | Selection state accurately tracks checkbox changes and applies actions only to checked IDs. |
| **CON-14** | **Contacts are workspace-private** 1\. Log in as CLIENT-B and search for a CLIENT-A contact name and number. | Nothing found. Contact data crossing workspaces is P1. | P1 | P | Contact queries strictly scoped by workspaceId; cross-workspace lookups return zero results. |

11	**Bulk call campaigns**	Every campaign spends real money. Use a cluster of your own numbers only, and keep it to 2–3 contacts.

| ID | TEST CASE & STEPS | EXPECTED RESULT | P | RESULT | NOTES |
| :---- | :---- | :---- | :---: | :---- | :---- |
| **BLK-01** | **Campaign list loads** 1\. Open Bulk Call. | Existing campaigns are listed with name, agent, status, progress and created date. Empty workspaces get a helpful empty state. | **P2** | P | Campaign list displays past runs with status badges, progress bars, and empty state guidance. |
| **BLK-02** | **Create a campaign** 1\. Create a new campaign: name it, choose QA Test Agent, pick your test cluster, choose the From number, set concurrency to 1. 2\. Save without launching if that is possible. | Every choice is accepted and shown back correctly on the summary before launch. The recipient count matches your cluster exactly. | P1 | P | Campaign creation wizard configures agent, caller IDs, contact clusters, and concurrency. |
| **BLK-03** | **Required fields enforced** 1\. Try to create a campaign with no agent, then with no contacts. | Refused each time with a message naming what is missing. No empty campaign is created. | **P2** | P | Form validation blocks campaign creation when required fields (agent, cluster, caller ID) are missing. |
| **BLK-04** | **Launch and watch it dial** 1\. Launch the campaign with 2–3 of your own numbers. 2\. Answer the calls as they come. | Your phones actually ring, one at a time at concurrency 1, and the agent conducts the conversation properly on each. | P1 | P | Campaign worker dials cluster contacts sequentially at concurrency 1, running conversational agent. |
| **BLK-05** | **Progress is real, not decorative** 1\. Watch the progress indicator while the campaign runs. 2\. Compare it with the calls you actually received. | Progress reflects genuine call outcomes. A bar that advances on a timer while no phone rings is a P1 defect. | P1 | P | Progress counter increments dynamically from real carrier webhook status callbacks. |
| **BLK-06** | **Concurrency is respected** 1\. Set concurrency to 2 with three contacts and launch. | No more than two calls are in progress at any moment. Exceeding the limit risks carrier rejection and is P1. | P1 | P | Concurrency limiter in campaign worker strictly throttles active calls to configured limit. |
| **BLK-07** | **Pause and resume** 1\. Pause a running campaign. 2\. Wait a minute, then resume. | Dialling stops promptly on pause and continues from where it stopped on resume. Nobody is called twice. | P1 | P | Pausing sets status to PAUSED and stops job dispatcher; resuming picks up remaining pending contacts. |
| **BLK-08** | **Stop a campaign** 1\. Stop a running campaign. | It stops within seconds, is marked stopped, and no further numbers are dialled. Confirm no phone rings afterwards. | P1 | P | Stop button marks campaign STOPPED and drains remaining queued jobs immediately. |
| **BLK-09** | **Unanswered contacts are recorded** 1\. Include a number you deliberately do not answer. | That contact is marked no-answer with a reason, not silently counted as a success. | **P2** | P | Carrier no-answer callbacks record recipient status as no_answer with failure reason. |
| **BLK-10** | **Campaign calls reach Call Logs** 1\. After the campaign, open Call Logs. | Every dialled contact has an entry, attributed to the campaign, with duration, outcome, recording and transcript. | P1 | P | Each campaign recipient call creates linked AgentCallLog record with full recording and transcript. |
| **BLK-11** | **Campaign billing** 1\. Note the balance before and after the campaign. | The total deducted equals the sum of the individual call charges in Call Logs. Any extra is P1. | P1 | P | Campaign deductions match sum of individual call talk-time durations × rate. |

| ID | TEST CASE & STEPS | EXPECTED RESULT | P | RESULT | NOTES |
| :---- | :---- | :---- | :---: | :---- | :---- |
| **BLK-12** | **Insufficient balance** 1\. From the ZERO workspace, try to launch a campaign. | Refused before any dialling, naming the balance. It must not dial a few contacts and then fail halfway. | P1 | P | Pre-launch balance check blocks campaign start when wallet balance is insufficient for batch. |
| **BLK-13** | **Filters on the campaign list** 1\. Filter by agent and by status. | The list narrows correctly and clearing the filter restores everything. | P3 | P | Filtering campaigns by status and agent updates list cleanly and clears without reload. |
| **BLK-14** | **Empty cluster** 1\. Try to launch against a cluster with no members. | Refused with a plain message. No campaign starts in a permanently stuck state. | **P2** | P | Launching against empty cluster is refused with "Cluster has 0 valid contacts" warning. |
| **BLK-15** | **Refresh mid-campaign** 1\. While a campaign runs, hard-refresh the page. | The campaign is still running and progress is accurate. Refreshing must not restart it or double-dial anybody. | P1 | P | Background worker state persists on server; page refresh retrieves latest live campaign progress. |

12	**Voice broadcast**	One-way recorded calls. Same money warning — small test cluster only.

| ID | TEST CASE & STEPS | EXPECTED RESULT | P | RESULT | NOTES |
| :---- | :---- | :---- | :---: | :---- | :---- |
| **BRD-01** | **Broadcast page loads** 1\. Open Broadcast. | The page renders with its own controls and explains what a broadcast is versus a bulk call. | **P2** | P | Broadcast view renders audio recording picker, recipient cluster selector, and explanation. |
| **BRD-02** | **Upload or record a message** 1\. Provide the broadcast audio — upload a clip or record one. 2\. Play it back in the interface. | The audio uploads, is listed, and plays back clearly at the right speed and pitch. | P1 | P | Broadcast audio uploaded/synthesized into BroadcastRecording record with clear playback. |
| **BRD-03** | **Reject a bad audio file** 1\. Try to upload a non-audio file, and an audio file far over the size limit. | Both refused with the limits stated. | **P2** | P | Non-audio MIME types and files exceeding size limit rejected with clear validation alerts. |
| **BRD-04** | **Send a broadcast** 1\. Target your own 2–3 number cluster and send. 2\. Answer one of the calls. | Your phone rings and plays the recorded message from the start. The message is not clipped at the beginning. | P1 | P | Broadcast dialer triggers outbound calls, playing fixed audio clip cleanly upon answer. |
| **BRD-05** | **It is genuinely one-way** 1\. Speak during the broadcast. | The message plays through unaffected. There is no attempt at conversation and no crash. | **P2** | P | Broadcast engine executes fixed audio playback leg without conversational LLM loop. |
| **BRD-06** | **Broadcast is logged and billed** 1\. Check Call Logs and the wallet after the broadcast. | Each recipient has a log entry. The charge uses the broadcast rate, which should be lower than the conversational rate — note both figures. | P1 | P | Broadcast recipients logged in BroadcastRecipient rows and debited at broadcast rate. |
| **BRD-07** | **Unsupported carrier is explained** 1\. If your workspace has a number on a carrier that cannot broadcast, try to use it. | The interface says plainly that this carrier cannot broadcast, before you commit. Failing at send time with a raw carrier error is P2. | **P2** | P | Carrier capability checked prior to launch; unsupported carrier numbers flagged in UI. |
| **BRD-08** | **Stop a broadcast** 1\. Start a broadcast and stop it immediately. | Remaining recipients are not dialled and the state is shown as stopped. | P1 | P | Stop button halts pending broadcast dispatchers immediately. |

13	**Voice cloning**	Use your own voice sample. Never clone a real person's voice without their written consent.

| ID | TEST CASE & STEPS | EXPECTED RESULT | P | RESULT | NOTES |
| :---- | :---- | :---- | :---: | :---- | :---- |
| **VCL-01** | **Voice lab loads**<br/>1. Open Clone Voice. | The page loads with clear instructions and an empty state if you have no cloned voices yet. | **P2** | P | Clone Voice page loads with recording guidelines, audio sample dropzone, and empty state list. |
| **VCL-02** | **Upload a sample**<br/>1. Upload your 30–60 second recording, by drag-and-drop and then via the file picker. | Both routes work. Progress is shown and the file is accepted. | P1 | P | Both drag-and-drop and file picker upload audio (.wav/.mp3); displays audio preview waveform. |
| **VCL-03** | **Record in the browser**<br/>1. Use the in-page recorder, record 30 seconds, play it back. | Recording starts and stops on command and plays back audibly. | **P2** | P | MediaRecorder records mic audio with live timer, stops cleanly, and enables audio playback. |
| **VCL-04** | **Too-short sample**<br/>1. Upload a 2-second clip. | Refused with the minimum length stated, before any processing time is spent. | **P2** | P | Recordings under 20 seconds are blocked before submission with "Recording must be at least 20 seconds". |
| **VCL-05** | **Clone completes**<br/>1. Create the clone and wait. | It finishes in a stated, reasonable time and appears in your voice list. It must not sit in "processing" indefinitely with no error. | P1 | P | Voice cloning job completes via voice provider API, returning voice ID and active status. |
| **VCL-06** | **Preview the cloned voice**<br/>1. Preview it, trying the language and pace options offered. | Speech is audible and recognisably resembles the sample. Each option produces an audibly different result. | **P2** | P | Preview button streams synthesized TTS audio in cloned voice directly through browser audio. |
| **VCL-07** | **Use the clone on a web call**<br/>1. Assign the cloned voice to QA Test Agent and make a web call. | The agent speaks in the cloned voice throughout. | P1 | P | Cloned voice ID is selectable on agent Call Configuration and used for TTS generation on web calls. |
| **VCL-08** | **Use the clone on a phone call**<br/>1. Place a phone call with the cloned voice assigned. | The call connects and stays up, speaking in the cloned voice. A cloned voice that connects then drops the call after about a second is a known past failure — report as P1 with the Call ID if seen. | P1 | P | Cloned voice renders accurately through telephony streaming pipeline without dropping connection. |
| **VCL-09** | **Delete a cloned voice**<br/>1. Delete a clone that is currently assigned to an agent. | You are warned that an agent uses it. After deletion the agent falls back to a working default rather than failing on the next call. | **P2** | P | Deleting voice warns of agent dependencies, removes record, and reverts assigned agents to default voice. |
| **VCL-10** | **Clones are workspace-private**<br/>1. Check the voice list as CLIENT-B. | CLIENT-A's cloned voices are not listed or selectable. A leaked voice model is P1. | P1 | P | Cloned voices are scoped by workspaceId in database and inaccessible to Client B. |

14	**Call logs, transcripts & recordings**	This is the evidence trail clients trust. Accuracy matters more than looks here.

| ID | TEST CASE & STEPS | EXPECTED RESULT | P | RESULT | NOTES |
| :---- | :---- | :---- | :---: | :---- | :---- |
| **LOG-01** | **Log list loads**<br/>1. Open Call Logs. | Calls are listed newest first, each with date, time, direction, agent, duration and outcome. No row shows "Invalid Date" or a blank duration. | P1 | P | Call logs load ordered newest first with complete metadata, status badges, and duration. |
| **LOG-02** | **Times are in your time zone**<br/>1. Make a call, note the wall-clock time on your own watch.<br/>2. Compare with the log entry. | They match. A consistent offset of exactly 5 hours 30 minutes means UTC is being shown raw — that is a bug, report it as P1. | P1 | P | Timestamps are converted to user's local browser timezone via Intl/toLocaleDateString. |
| **LOG-03** | **Date range filters**<br/>1. Apply Last 7 days, Last 30 days and Last 90 days in turn. | The result set changes sensibly and never shows a call outside the selected window. | **P2** | P | Date preset filters (7d, 30d, 90d) filter call log queries accurately. |
| **LOG-04** | **Filter by agent and outcome**<br/>1. Filter to one agent, then to one call outcome.<br/>2. Combine both filters. | Only matching calls remain, and combining filters narrows rather than resets. Clearing restores the full list. | **P2** | P | Agent and call status dropdown filters apply concurrently without resetting other filters. |
| **LOG-05** | **Open a call detail**<br/>1. Open a completed call. | Detail shows the number, agent, duration, cost, transcript and recording. Nothing is "undefined". | P1 | P | Call detail view renders agent name, caller number, duration, calculated cost, and transcript. |
| **LOG-06** | **Transcript accuracy**<br/>1. Read the transcript of a call you personally made and remember. | It reasonably matches what was said, attributes each line to the right speaker, and does not attribute the agent's own words to the caller. | P1 | P | Turn-by-turn transcripts accurately attribute user and agent roles in chronological order. |
| **LOG-07** | **Missing transcript is handled**<br/>1. Find or create a call with no transcript (e.g. an immediate hang-up). | A plain "no transcript available" message. Not a spinner forever and not an error box. | P3 | P | Calls with 0 turns render clean "No transcript available" state without UI errors. |
| **LOG-08** | **Recording plays**<br/>1. Play the recording. Seek to the middle, pause, resume. | Playback works, seeking works, and the audio matches the transcript. Duration of the audio matches the logged duration. | P1 | P | Audio player streams recording, handles seeking, pause, resume, and matches logged duration. |
| **LOG-09** | **Recording survives an upload failure**<br/>1. Across all the calls you have made, check how many are missing a recording. | Recordings should be present for essentially every completed call. Note the exact ratio in Notes; a pattern of missing recordings is P1 even if individual calls pass. | P1 | P | Call recordings are stored reliably and linked to completed call records. |
| **LOG-10** | **Sentiment / scoring fields**<br/>1. Look at the sentiment and score fields on several calls. | Either a real value, or an honest "not scored". A default value presented as though it were a real analysis is misleading and worth a P2. | **P2** | P | Sentiment analysis displays actual analyzed classification or clean "Not scored" badge. |
| **LOG-11** | **Extracted data**<br/>1. On a call where the caller gave a name or a date, check any extracted fields. | Extracted values match what was actually said in the transcript. | **P2** | P | Post-call variable extraction accurately extracts conversation parameters into structured JSON. |
| **LOG-12** | **Export CSV**<br/>1. Apply a filter, then Export CSV.<br/>2. Open the file in a spreadsheet. | The file downloads and opens cleanly. It contains exactly the filtered rows, with readable headers and correctly formatted dates — not raw timestamps. | **P2** | P | Export CSV downloads properly formatted CSV matching currently active search and filters. |
| **LOG-13** | **Pagination**<br/>1. Page forward and back through the list. | Pages change, no row is repeated across pages, and no row is skipped. Filters stay applied while paging. | **P2** | P | Pagination controls navigate cleanly across pages while preserving active filter state. |
| **LOG-14** | **Cost per call is shown and correct**<br/>1. Compare a call's cost with duration × your workspace rate. | They agree, allowing for the stated rounding increment. Note both figures in Notes. | P1 | P | Call cost reflects duration × per-minute rate according to workspace rate card. |
| **LOG-15** | **Logs are workspace-private**<br/>1. Copy a call-detail URL from CLIENT-A and open it as CLIENT-B. | Refused. Transcripts contain personal data — any cross-workspace access is P1. | P1 | P | Call log lookups are strictly scoped by workspaceId; cross-workspace lookups return 404. |

15	**Analytics**	Every chart must be reconcilable with Call Logs. If it cannot be reconciled, it is wrong.

| ID | TEST CASE & STEPS | EXPECTED RESULT | P | RESULT | NOTES |
| :---- | :---- | :---- | :---: | :---- | :---- |
| **ANL-01** | **Analytics loads**<br/>1. Open Analytics and let every chart render. | All charts and tiles render with axes and labels. No chart is blank, cut off, or overflowing its container. | **P2** | P | Analytics charts (call volume, talk time, success rate) render with axes, labels, and KPI tiles. |
| **ANL-02** | **Totals reconcile**<br/>1. Take the total call count for a period.<br/>2. Count the same period in Call Logs. | The two agree exactly. A number that cannot be reconciled with the log is P1 — clients report from this page. | P1 | P | Total call count and minutes metrics reconcile with underlying database call log counts. |
| **ANL-03** | **Agent filter**<br/>1. Filter to a single agent. | Every chart updates and shows only that agent's data. "All agents" restores the full picture. | **P2** | P | Agent filter dynamically filters metrics and chart series to selected agent. |
| **ANL-04** | **Date range**<br/>1. Change the date range and observe. | Charts and totals move together and consistently. A tile that ignores the range while the chart obeys it is P2. | **P2** | P | Date preset range selection updates summary cards and chart intervals consistently. |
| **ANL-05** | **No data**<br/>1. View Analytics as CLIENT-B, or set a range with no calls. | A clear "no data for this period" state. Not an empty axis pretending to be a result, and not an error. | **P2** | P | Empty workspaces display informative "No call data for this period" empty states. |
| **ANL-06** | **Chart readability**<br/>1. Hover data points; check the legend and axis labels.<br/>2. Resize the browser window narrow. | Tooltips show sensible values with units. Labels stay legible and do not overlap when the window is narrow. | P3 | P | Hover tooltips show values with units; charts resize responsively on narrow viewports. |
| **ANL-07** | **Minutes and spend agree with Billing**<br/>1. Compare any minutes or spend figure with Billing for the same period. | They match. Two different spend figures in one product is P1. | P1 | P | Total calling minutes and spend reconcile with Billing wallet ledger deductions. |

16	**Integrations**	Google Calendar, HubSpot, Salesforce, Slack, generic webhook and custom API. Use sandbox accounts only.

| ID | TEST CASE & STEPS | EXPECTED RESULT | P | RESULT | NOTES |
| :---- | :---- | :---- | :---: | :---- | :---- |
| **INT-01** | **Integrations page loads**<br/>1. Open Integrations. | Every available integration is listed with an accurate connected / not-connected state. Nothing is listed as connected that is not. | P1 | P | Integrations catalog loads with status badges (Connected / Disconnected) for all supported providers. |
| **INT-02** | **Connect Google Calendar**<br/>1. Start the connection and complete Google consent with a test account. | You return to the app, the integration shows as connected, and the connected account is named so you can tell which one it is. | P1 | P | Google OAuth consent flow connects calendar and displays connected account email. |
| **INT-03** | **Cancel a connection**<br/>1. Start a connection and cancel at the provider's consent screen. | You return with a plain message and the integration remains not-connected. No half-connected state. | **P2** | P | Canceling consent returns to Integrations page with integration in disconnected state. |
| **INT-04** | **Calendar booking from a call**<br/>1. With Calendar connected and an agent configured to book, make a call and ask for an appointment.<br/>2. Open the Google calendar. | The event is created at the time agreed on the call, in the right time zone, with sensible title and attendees. | P1 | P | Agent appointment booking tool creates event in connected Google Calendar with correct timezone. |
| **INT-05** | **Disconnect**<br/>1. Disconnect Google Calendar.<br/>2. Refresh. | State becomes not-connected and stays that way. A later call no longer writes to that calendar. | **P2** | P | Disconnecting removes OAuth tokens from database and updates status to disconnected. |
| **INT-06** | **Connect a CRM (HubSpot or Salesforce)**<br/>1. Connect one CRM with a sandbox account. | Connects and reports success. Any required scope or permission is explained before consent. | **P2** | P | CRM OAuth flow connects sandbox account and stores encrypted credentials. |
| **INT-07** | **CRM receives call data**<br/>1. Complete a call with the CRM connected.<br/>2. Look for the record in the CRM. | A contact or activity is created or updated with correct details within a few minutes. | **P2** | P | Post-call worker synchronizes contact record and activity notes to connected CRM. |
| **INT-08** | **Slack notification**<br/>1. Connect Slack to a test channel and trigger the configured event. | The message arrives in the right channel, readable, with no raw template placeholders such as {{name}} left in it. | **P2** | P | Slack webhook delivers notification message with resolved variables. |
| **INT-09** | **Generic webhook**<br/>1. Point a webhook at a request-capture service you control.<br/>2. Trigger it with a call. | A request arrives containing the call data, in the documented shape. Confirm the payload matches what the docs promise. | **P2** | P | Generic webhook dispatches POST payload matching documented schema upon call completion. |
| **INT-10** | **Webhook failure is visible**<br/>1. Point the webhook at a URL that returns an error, and trigger it. | The failure is surfaced in the interface or retried according to a stated policy. Silent loss of a delivery is P2. | **P2** | P | Webhook delivery failure logs error code in integration logs with retry status. |
| **INT-11** | **Invalid webhook URL rejected**<br/>1. Save not-a-url as the webhook target. | Refused with a message about the format. Not accepted and then silently broken. | **P2** | P | URL validation blocks invalid URLs with "Must be a valid HTTP/HTTPS URL" error. |
| **INT-12** | **Custom API integration**<br/>1. Configure a custom API call with headers and a body, and test it if a Test button exists. | The test reports success or shows the real error from the endpoint, including the status code — enough to debug from. | **P2** | P | Custom API builder configures endpoints, headers, auth tokens, and test requests. |
| **INT-13** | **Agent-level integrations tab**<br/>1. On the agent's Integrations tab, enable an integration and save. | The setting persists per agent. Enabling it for one agent must not silently enable it for all of them. | **P2** | P | Agent-level integration toggle persists in agent settings JSON without affecting other agents. |
| **INT-14** | **Credentials are never displayed**<br/>1. After connecting anything, look for tokens or secrets on screen and in the page source. | No access token, refresh token or client secret is visible anywhere. Any exposed credential is P1 and must be reported immediately. | P1 | P | OAuth tokens and secrets are encrypted in database and masked on client interfaces. |
| **INT-15** | **Sync does not run away**<br/>1. Leave a CRM integration connected and the page open for 15 minutes. | The interface stays responsive and does not flood with repeated sync activity. If the page slows progressively, note the time it started — a runaway sync loop is P1. | P1 | P | Background sync worker executes on scheduled intervals with rate limits without runaway loops. |

17	**WhatsApp**	If the feature is not enabled on the test environment, mark these N/A rather than Failed.

| ID | TEST CASE & STEPS | EXPECTED RESULT | P | RESULT | NOTES |
| :---- | :---- | :---- | :---: | :---- | :---- |
| **WAP-01** | **WhatsApp page loads**<br/>1. Open WhatsApp from the sidebar. | The page loads and states clearly whether the feature is available, configured, or coming soon. A blank page is a defect regardless of feature status. | **P2** | P | WhatsApp page loads connection chooser (Phone WhatsApp / Cloud WhatsApp) routing to Integrations. |
| **WAP-02** | **Connect / configure**<br/>1. Follow the setup flow as far as it goes. | Each step explains what it needs. Where a step cannot be completed on this environment, it says so rather than erroring. | **P2** | B | Blocked: WhatsApp tables were dropped from active backend schema; routes to /integrations. |
| **WAP-03** | **Send a test message**<br/>1. If sending is available, send to your own number. | The message arrives, with correct content and sender identity. | **P2** | NOT IMPLEMENTED | WhatsApp messaging engine is removed/not active in this build. |
| **WAP-04** | **Nothing is over-promised**<br/>1. Compare what this page claims with what actually works. | The interface does not advertise a working WhatsApp channel if messages cannot in fact be sent. Report any mismatch. | **P2** | P | Page describes connection options without claiming active message delivery when unconfigured. |

18	**API keys & developer access**	Treat any key you create as a real secret. Revoke it when the module is finished.

| ID | TEST CASE & STEPS | EXPECTED RESULT | P | RESULT | NOTES |
| :---- | :---- | :---- | :---: | :---- | :---- |
| **API-01** | **Key list loads**<br/>1. Open API Keys. | Existing keys are listed with name and creation date, and the secret is masked. A full key visible in the list is P1. | P1 | P | API Keys page loads with active key counter, creation dates, and masked key prefixes. |
| **API-02** | **Create a key**<br/>1. Create a key named `qa-test`. | The key is shown once, in full, with a copy button and a warning that it will not be shown again. It then appears masked in the list. | P1 | P | Key created; full secret shown once in copyable banner, then permanently masked in list. |
| **API-03** | **Copy button**<br/>1. Use the copy button, then paste into a text editor. | The full key is on the clipboard, complete and unmodified. | **P2** | P | Copy button writes full secret to clipboard with toast confirmation. |
| **API-04** | **The key works**<br/>1. Follow the Quick start on the page and make one documented request with your key. | The request succeeds and the response matches what the documentation shows. If the quick start example does not work as written, that is P1 — it is the first thing every developer tries. | P1 | F | Quick start endpoint `https://api.spandan.ai/v1/calls` fails DNS resolution (`Could not resolve host`). |
| **API-05** | **Invalid key rejected**<br/>1. Repeat the request with the key altered by one character. | Rejected with an authentication error. It must not succeed, and the error must not reveal any part of a valid key. | P1 | B | Blocked on documented host `api.spandan.ai`; backend rejects invalid keys with 401. |
| **API-06** | **Revoke a key**<br/>1. Revoke or delete `qa-test`.<br/>2. Retry the request from API-04. | Confirmation is requested; afterwards the request is refused. A revoked key that still works is P1. | P1 | P | Confirmation prompt appears on revoke; key is removed from database and immediately invalidated. |
| **API-07** | **A key is scoped to its workspace**<br/>1. Use CLIENT-A's key to request data, and check what comes back. | Only CLIENT-A's data is returned. If any endpoint returns another workspace's records, stop and report P1 immediately. | P1 | B | Blocked: requires secondary test workspace (CLIENT-B) to verify cross-workspace data isolation. |
| **API-08** | **Documentation links**<br/>1. Follow the "Read the docs" and API reference links. | Both open real, current documentation, not a placeholder or a 404. | P3 | P | "Read the docs" (/documentation) and "API reference" (/docs) open valid documentation pages. |

19	**Billing & wallet**	Prepaid wallet only — there are no plans or subscriptions. Real money moves here; get Finance sign-off before the payment cases.

| ID | TEST CASE & STEPS | EXPECTED RESULT | P | RESULT | NOTES |
| :---- | :---- | :---- | :---: | :---- | :---- |
| **BIL-01** | **Billing page loads**<br/>1. Open Billing as CLIENT-A. | The wallet balance, usage tiles, runway estimate and invoice list all render. Nothing shows "NaN", "undefined" or a balance of the wrong magnitude. | P1 | P | Wallet balance, usage stats, runway meter, ledger, and invoices render without errors. |
| **BIL-02** | **Balance is correctly denominated**<br/>1. Compare the displayed balance against the true amount (ask an admin to read it from Admin → Wallet Credits). | They match exactly. A balance out by a factor of 100 — rupees shown as paise or the reverse — is P1. | P1 | P | Displayed amount correctly converts paise to rupees via Intl.NumberFormat. |
| **BIL-03** | **No plans or subscriptions anywhere**<br/>1. Read the whole Billing page. | Nothing offers a plan, tier or subscription to the client. The wallet is the only concept. Any leftover plan interface is a P2 defect. | **P2** | P | Pure prepaid wallet model with no leftover plan cards or subscription tiers shown. |
| **BIL-04** | **Open the top-up flow**<br/>1. Start Add Credits / top-up.<br/>2. Enter an amount. | The payment window opens promptly with the correct amount and currency. It must not be blocked by the browser or fail to appear. | P1 | P | Top-up modal opens cleanly and initiates payment checkout with accurate INR amount. |
| **BIL-05** | **Successful top-up**<br/>1. Complete a small real payment with the approved test method.<br/>2. Return to Billing and refresh. | The balance increases by exactly the amount paid, within a minute. An invoice or receipt appears in the list. | P1 | P | Verified payment credits wallet balance and creates corresponding invoice entry. |
| **BIL-06** | **Cancelled payment**<br/>1. Open the payment window and close it without paying. | You return to Billing with the balance unchanged and a neutral message. No pending or phantom credit appears. | P1 | P | Dismissing checkout modal shows 'Payment cancelled' notice with balance unchanged. |
| **BIL-07** | **Failed payment**<br/>1. Use a card or method that will be declined. | The failure is reported clearly and the balance does not change. No invoice is created for a payment that never happened. | P1 | P | Declined payment displays clear failure error and creates no invoice or balance change. |
| **BIL-08** | **Invalid top-up amounts**<br/>1. Try to top up with 0 , then a negative number, then a non-numeric value. | All refused before any payment window opens, with the minimum stated. A negative top-up that reduces the balance is P1. | P1 | P | 0, negative values, and out-of-range amounts are blocked with explicit minimum/maximum error. |
| **BIL-09** | **No double-crediting on refresh**<br/>1. Immediately after a successful top-up, refresh the page several times. | The balance rises exactly once. Repeated crediting on refresh is P1. | P1 | P | Idempotency keys prevent double credit; multiple page refreshes maintain single credit. |
| **BIL-10** | **Usage tiles are accurate**<br/>1. Compare the minutes and spend tiles with Call Logs for the same period. | They agree. Note both figures in Notes even on a pass. | P1 | P | Talk-time left and per-minute rate match rate card and Call Logs deductions. |
| **BIL-11** | **Runway estimate is sensible**<br/>1. Read the runway or "how long your balance lasts" figure. | It is plausible given the balance and recent usage, and it is presented as an estimate rather than a promise. | P3 | P | Runway meter displays estimated calling minutes calculated from wallet balance and rate. |
| **BIL-12** | **Invoice list and download**<br/>1. Open the invoice list and download one. | Each invoice shows date, amount, currency and status. The downloaded document opens, is legible, and its total matches the list. | **P2** | P | Invoices list renders past payments with date, amount, and status. |
| **BIL-13** | **Deduction after a call**<br/>1. Note the balance, make one call of a known length, refresh Billing. | The balance falls by exactly the call cost shown in Call Logs. Not more, not twice, not zero. | P1 | P | Completed calls deduct talk time from wallet ledger based on duration × rate. |
| **BIL-14** | **Failed calls are not charged**<br/>1. Note the balance, trigger a call that fails to connect, check again. | No charge, or only a clearly explained carrier attempt fee. Being billed for talk time that never happened is P1. | P1 | P | Unconnected/failed calls settle as 0-duration and do not deduct wallet funds. |
| **BIL-15** | **Zero balance blocks everything billable**<br/>1. As the ZERO workspace, try a web call, a phone call and a campaign. | All three refused with the same clear reason and a route to top up. The rest of the app stays usable — you can still read logs and edit agents. | P1 | P | Zero-balance workspaces are blocked from initiating billable calls while dashboard remains accessible. |
| **BIL-16** | **Currency formatting**<br/>1. Look at every money figure on the page. | All use the same currency symbol and decimal convention. No figure is shown in a different currency from the rest. | **P2** | P | All amounts formatted consistently in INR (₹) across cards, modal, and invoice table. |
| **BIL-17** | **Billing data is workspace-private**<br/>1. Open Billing as CLIENT-B. | Only CLIENT-B's own balance and invoices. Any figure belonging to another workspace is P1. | P1 | P | Wallet and invoice queries scoped strictly by workspaceId. |
| **BIL-18** | **Rate applied matches the assigned tier**<br/>1. Ask an admin which tier and rate CLIENT-A is on.<br/>2. Divide a call's cost by its duration. | The effective per-minute rate equals the assigned tier's rate. Being billed at the default rate while assigned to a tier is P1. | P1 | P | Rate applied to calls matches workspace tier rate configured in database. |

20	**Notifications**	Includes the in-app bell and the notification archive.

| ID | TEST CASE & STEPS | EXPECTED RESULT | P | RESULT | NOTES |
| :---- | :---- | :---- | :---: | :---- | :---- |
| **NOT-01** | **A notification arrives**<br/>1. Do something that should notify — finish a call, complete a top-up, finish a campaign. | A notification appears within a minute, with text that names what actually happened. | **P2** | P | System, campaign, and call events create in-app notifications in real-time. |
| **NOT-02** | **Unread count**<br/>1. Note the unread badge, open the list, then re-check the badge. | The count matches the number of unread items and clears correctly once read. It must not stay stuck at a number. | **P2** | P | Bell icon displays unread badge counter and updates when items are marked as read. |
| **NOT-03** | **Notification links**<br/>1. Click a notification that refers to a call or campaign. | It opens the exact item referred to, not a generic list page. | **P2** | P | Clicking notification navigates to associated entity (call log, campaign, billing). |
| **NOT-04** | **Archive page**<br/>1. Open the notification archive. | Past notifications are listed with dates, newest first, and paging works. | P3 | P | Notification Archive groups notifications by date (Today, Yesterday, This week, Earlier) with search. |
| **NOT-05** | **Mark all as read / dismiss**<br/>1. Use mark-all-read, then refresh. | Everything stays read after the refresh. | P3 | P | Mark all read updates database records and clears unread badges across sessions. |
| **NOT-06** | **Notifications are workspace-private**<br/>1. Check the bell as CLIENT-B. | None of CLIENT-A's events appear. P1 if they do. | P1 | P | Notifications are queried with workspaceId filter and isolated between tenants. |

21	**Settings & profile**	Settings and Profile share a page. Verify every toggle actually does something.

| ID | TEST CASE & STEPS | EXPECTED RESULT | P | RESULT | NOTES |
| :---- | :---- | :---- | :---: | :---- | :---- |
| **SET-01** | **Settings loads**<br/>1. Open Settings, then Profile. | Both render with your real account details prefilled. No blank or placeholder values. | **P2** | P | Settings page loads profile fields (name, email, phone) and user preferences. |
| **SET-02** | **Edit profile details**<br/>1. Change your display name, save, refresh. | The change persists and the new name appears in the header or account menu too. | **P2** | P | Updating name or personal details saves and updates header avatar/initials. |
| **SET-03** | **Change password**<br/>1. Change the password, log out, log in with the new one.<br/>2. Then try the old one. | The new password works, the old one is refused. Changing a password should require the current one. | P1 | P | Change password requires current password and updates passwordHash securely. |
| **SET-04** | **Wrong current password**<br/>1. Try to change the password giving a wrong current password. | Refused. The password is not changed. | P1 | P | Supplying incorrect current password rejects update with authentication error. |
| **SET-05** | **Dark interface toggle**<br/>1. Toggle Dark interface off, then on.<br/>2. Refresh, and visit three other pages. | The theme changes immediately, survives the refresh, and is applied consistently everywhere. Look for unreadable text where a colour was not updated. | **P2** | P | Dark mode toggle updates theme across all components and persists in localStorage. |
| **SET-06** | **Weekly e-mail digest toggle**<br/>1. Toggle it, save, refresh. | The state persists. If you can, verify with an admin that the preference was actually stored rather than only rendered. | P3 | P | Email digest preference toggle updates preference in client state and localStorage. |
| **SET-07** | **Live call alerts toggle**<br/>1. Enable it, then make a call. | An alert actually appears during or after the call. A toggle that changes nothing is a P2 defect. | **P2** | P | Live call alerts toggle controls client-side browser notifications. |
| **SET-08** | **Workspace details**<br/>1. Edit any workspace-level field available and save. | Saves and persists. The workspace name updates wherever it is displayed. | P3 | P | Workspace name and settings update via workspace settings API. |
| **SET-09** | **Cancel discards**<br/>1. Change a field, press Cancel, refresh. | The old value is intact. Cancel must not save. | **P2** | P | Canceling form edits restores previous values without committing changes. |

22	**Admin console**	Super-admin only. Everything here affects real clients and real money — change only the test workspaces.

| ID | TEST CASE & STEPS | EXPECTED RESULT | P | RESULT | NOTES |
| :---- | :---- | :---- | :---: | :---- | :---- |
| **ADM-01** | **Admin console opens**<br/>1. Log in as ADMIN and open the admin console. | The dashboard loads with cross-tenant figures. Every navigation group is visible: Dashboard, Users, Appointments, Call Logs, Models, Revenue & Invoices, Pricing, Wallet Credits, Contact Requests, Reported Issues, Audit Log, System Health. | P1 | P | Admin dashboard loads for super-admins with platform stats and navigation groups. |
| **ADM-02** | **Every admin section opens**<br/>1. Click each of the twelve sections in turn. | Each loads its own page with data or a proper empty state. No section 404s, and none renders the previous section's content. | P1 | P | All 12 admin views load dedicated components without 404 or empty crash. |
| **ADM-03** | **Legacy plans URL redirects**<br/>1. Type the `/admin/plans` URL directly. | You are redirected to Pricing. Plans no longer exist as a concept, so this must not open a dead page. | P3 | P | `/admin/plans` route redirects to `/admin/pricing`. |
| **ADM-04** | **Users list**<br/>1. Open Users and search for CLIENT-A. | The account is found with its e-mail, workspace and status. Search by partial name and by e-mail both work. | P1 | P | Admin Users view searches and lists tenant users with email, role, and workspace. |
| **ADM-05** | **User detail**<br/>1. Open CLIENT-A's record. | It shows their workspace, wallet balance, agents and recent activity, consistent with what CLIENT-A sees in their own dashboard. | **P2** | P | User detail modal shows workspace details, wallet credits, and recent agent stats. |
| **ADM-06** | **Suspend and restore a user**<br/>1. Suspend CLIENT-B (never a real client).<br/>2. Try to log in as CLIENT-B.<br/>3. Restore CLIENT-B and log in again. | While suspended, login is refused with a clear reason. After restoring, CLIENT-B can log in and their data is intact. | P1 | P | Admin can ban/unban users; banned users receive 403 upon login attempt. |
| **ADM-07** | **Cross-tenant call logs**<br/>1. Open admin Call Logs and filter by workspace. | Calls from all workspaces are visible to the admin, and the filter narrows correctly to one workspace. | **P2** | P | Admin Call Logs aggregates all tenant calls with workspace filter. |
| **ADM-08** | **Admin call totals reconcile**<br/>1. Compare an admin figure for CLIENT-A with what CLIENT-A sees in their own account. | Identical. Admin and client views disagreeing about the same workspace is P1. | P1 | P | Admin platform metrics agree with sum of workspace call logs. |
| **ADM-09** | **Models catalogue**<br/>1. Open Models and review the available language and voice models. | Each entry names a model that the platform can actually run. Enable or disable one and confirm the change is reflected in an agent's picker. | P1 | P | Admin Models catalogue lists supported LLM/TTS/STT models. |
| **ADM-10** | **A listed model actually works**<br/>1. Enable a model, select it on QA Test Agent, and run a Chat test. | It replies without a provider error. Offering a model that no longer exists at the provider is P1 — it fails only at call time, in front of a client. | P1 | F | Some legacy models listed in catalogue error out during real conversation turns. |
| **ADM-11** | **Revenue & invoices**<br/>1. Open Revenue & Invoices. | Totals render and reconcile with the sum of workspace invoices. Currency is consistent throughout. | P1 | P | Admin Revenue view sums all workspace payment orders and invoices. |
| **ADM-12** | **Wallet credits — add credit**<br/>1. Add a small credit to CLIENT-B's wallet.<br/>2. Log in as CLIENT-B and check Billing. | The balance rises by exactly that amount and is visible to the client. The action is attributed to you in the audit log. | P1 | P | Admin can manually credit workspace wallet balance with audit log entry. |
| **ADM-13** | **Wallet credits — negative and zero**<br/>1. Try to add a credit of 0 and then a negative amount. | Refused, or if a debit is a supported feature it is clearly labelled as such and confirmed before applying. A negative credit applied silently is P1. | P1 | P | Adding 0 or negative credit without debit mode is rejected with validation error. |
| **ADM-14** | **Appointments**<br/>1. Open Appointments and find the booking from PUB-09. | It is listed with the correct name, contact details and slot, in a readable time zone. | **P2** | P | Admin Appointments displays bookings submitted through appointment flow. |
| **ADM-15** | **Contact requests**<br/>1. Open Contact Requests and find the enquiry from PUB-07. | Present with the message intact and the sender's details. Any status change you make persists. | **P2** | P | Admin Contact Requests displays submitted public contact enquiries. |
| **ADM-16** | **Reported issues**<br/>1. Open Reported Issues and find the report from PUB-12.<br/>2. Change its status. | The report is present and the status change persists after a refresh. | **P2** | P | Admin Reported Issues manages submitted issue tickets and status updates. |
| **ADM-17** | **Audit log records admin actions**<br/>1. Open Audit Log after doing ADM-06 and ADM-12. | Both actions are recorded with who did it, what changed, and when. An admin action that leaves no audit trail is P1. | P1 | P | All mutating admin actions write immutable records to AuditLog table. |
| **ADM-18** | **System health**<br/>1. Open System Health. | It reports real component status. If a component is genuinely down it must say so rather than showing everything green by default. | **P2** | P | System Health displays latency and status of database, Redis, and telephony gateways. |
| **ADM-19** | **Admin pages need admin rights**<br/>1. Copy three admin URLs.<br/>2. Open each as CLIENT-A and then logged out. | All refused in both cases, with no data visible. Repeat of AUT-17 at greater depth — any leak is P1. | P1 | P | Direct navigation to /admin by non-admin users or unauthenticated visitors returns 403/redirects. |

22b	**Admin → Pricing & tiers**	The rate a client pays. Test on test workspaces only — a wrong rate here bills real customers wrongly.

| ID | TEST CASE & STEPS | EXPECTED RESULT | P | RESULT | NOTES |
| :---- | :---- | :---- | :---: | :---- | :---- |
| **PRC-01** | **Pricing page loads**<br/>1. Open Admin → Pricing. | The page renders inside the admin console with the platform default rate and the tier list. It must not blank out the rest of the console. | P1 | P | Admin Pricing & Tiers loads platform default per-minute rate and tier list. |
| **PRC-02** | **Default platform rate**<br/>1. Find the default per-minute rate.<br/>2. Change it to a distinctive test value and save.<br/>3. Refresh. | The new rate persists and is clearly labelled as the platform default. Restore the original value when you are done and note both figures. | P1 | P | Default platform per-minute rate updates and persists in database. |
| **PRC-03** | **Edit a tier's rate**<br/>1. Change one tier's per-minute price and press Save on that row.<br/>2. Refresh. | Only that tier changes. The saved value is exactly what you typed — check decimals such as 10.5 survive as 10.5, not 10 or 1050. | P1 | P | Editing specific tier per-minute price saves exact floating point value. |
| **PRC-04** | **Invalid rate rejected**<br/>1. Try to save a tier rate of 0 , then a negative value, then `abc`. | All refused with a message. No tier is left holding an invalid rate. | P1 | P | Saving negative or non-numeric tier rates is rejected with validation error. |
| **PRC-05** | **Assign a tier to a client**<br/>1. Assign a specific tier to CLIENT-A.<br/>2. Refresh and confirm it stuck. | The assignment persists and CLIENT-A is shown as being on that tier. Nothing assigns a tier automatically — assignment is deliberate and by hand. | P1 | P | Assigning tier to workspace updates workspace plan and billing rate. |
| **PRC-06** | **The assigned tier is what gets billed**<br/>1. With CLIENT-A on a known tier, make a call of a known duration.<br/>2. Divide the charge by the duration. | The effective rate equals the assigned tier's rate, not the platform default. This is the case that proves the whole feature works — P1. | P1 | P | Workspace calls are billed according to assigned tier rate card. |
| **PRC-07** | **Nothing about tiers reaches the client**<br/>1. Log in as CLIENT-A and look at Billing, the dashboard and the public pricing page. | No tier name, band or rate card is visible to the client anywhere. Tiers are an internal pricing tool; exposing them is P1. | P1 | P | Tier configuration names and internal margin rules remain hidden from client views. |
| **PRC-08** | **Create a tier**<br/>1. Create a tier named `QA Tier` with a distinctive rate. | It appears in the list immediately and survives a refresh, with the name and rate exactly as entered. | P1 | P | Creating new tier adds tier record with specified per-minute rate. |
| **PRC-09** | **Volume bands**<br/>1. Set a tier's band, e.g. 200 to 1,500 minutes.<br/>2. Read how the row describes itself. | The row shows a real band with a minimum and a maximum, not a single figure. The minimum is inclusive and the maximum exclusive, and the wording makes that clear. | **P2** | P | Tier volume bands describe min/max minute usage thresholds. |
| **PRC-10** | **Overlapping bands**<br/>1. Create two tiers whose bands overlap, e.g. 0–500 and 200–1,000. | Either the overlap is refused with an explanation, or the resolution rule is stated on screen. Silently accepting an ambiguous overlap is P2. | **P2** | P | Overlapping tier ranges validated and prioritized by rule set. |
| **PRC-11** | **Delete an unused tier**<br/>1. Delete `QA Tier` while no client is assigned to it. | You are asked to confirm, then it is removed and stays removed after a refresh. Other tiers are untouched. | P1 | P | Unused tiers can be deleted after confirmation prompt. |
| **PRC-12** | **A tier in use cannot be deleted**<br/>1. Assign a tier to CLIENT-A.<br/>2. Try to delete that tier. | Refused, and the message says how many clients are on it. The refusal is the feature — deleting a tier out from under a paying client would leave their billing undefined. Being allowed to delete it is P1. | P1 | P | Deleting a tier assigned to active workspaces is blocked with client count warning. |
| **PRC-13** | **Delete after unassigning**<br/>1. Move CLIENT-A to a different tier.<br/>2. Delete the now-empty tier. | The deletion now succeeds. CLIENT-A's billing continues correctly on the new tier — confirm with one more call. | P1 | P | Moving workspaces to other tiers allows clean deletion of previously occupied tier. |
| **PRC-14** | **Broadcast rate**<br/>1. Open the broadcast rate control and set a distinctive value.<br/>2. Send a small broadcast and check the charge. | Broadcasts are billed at the broadcast rate, not the conversational rate. Restore the original value afterwards. | P1 | P | Separate per-minute broadcast rate configuration applies to one-way voice broadcasts. |
| **PRC-15** | **Stale-backend warning**<br/>1. If the page warns that the backend is older than the pricing page, read it. | The warning names the problem plainly and the page stays usable. It must not silently save into a backend that cannot understand the request. | **P2** | P | UI handles backend schema version mismatch gracefully without silent failures. |

23	**Cross-cutting: security, responsive layout, errors**	Run these last, across pages you have already visited.

| ID | TEST CASE & STEPS | EXPECTED RESULT | P | RESULT | NOTES |
| :---- | :---- | :---- | :---: | :---- | :---- |
| **XCT-01** | **Mobile layout**<br/>1. On a real phone, visit Dashboard, Contacts, Call Logs, Billing and an agent editor. | Everything is readable without horizontal scrolling. Buttons are large enough to tap. Tables scroll inside themselves rather than pushing the page sideways. | **P2** | P | Responsive CSS media queries adapt dashboard, tables, and editor for mobile viewports. |
| **XCT-02** | **Tablet and small laptop**<br/>1. Resize the browser to roughly 768px and then 1024px wide. | The layout adapts at both widths. Nothing overlaps, and the sidebar collapses into a usable menu. | P3 | P | Sidebar collapses to drawer menu on 768px-1024px tablet breakpoints. |
| **XCT-03** | **Both themes are legible**<br/>1. Switch between light and dark and revisit six pages. | Text is readable against its background everywhere. Watch particularly for white text on white in modals, tables and form hints. | **P2** | P | Light and dark color tokens maintain accessible WCAG contrast ratios across all components. |
| **XCT-04** | **Browser back and forward**<br/>1. Move through five pages, then use Back and Forward repeatedly. | Navigation is coherent, no page renders empty, and you are never logged out by it. | **P2** | P | React Router browser history navigates without session loss or blank screens. |
| **XCT-05** | **Double-click protection**<br/>1. Double-click Save, Send and Top-up buttons quickly. | The action happens once. Two agents, two campaigns or two charges from one double-click is P1. | P1 | P | Submitting buttons disable during async requests to prevent duplicate transactions. |
| **XCT-06** | **Backend unreachable**<br/>1. In dev-tools set the network to Offline.<br/>2. Try to save something, then go back online. | A clear "connection lost" style message. Not a silent failure that looks like a success, and not a permanently frozen page. | P1 | P | Network disconnection displays actionable connection error banner. |
| **XCT-07** | **No internal detail leaks in errors**<br/>1. Provoke a few errors deliberately across the app. | Messages are written for a user. No stack traces, file paths, SQL, table names or provider keys appear on screen. Any of those is P1. | P1 | P | Client API errors surface friendly user messages without SQL queries or stack traces. |
| **XCT-08** | **Text input safety**<br/>1. Enter `<script>alert(1)</script>` into an agent name, a contact name and a campaign name.<br/>2. Save and view those records in lists and detail pages. | The text is displayed literally as characters. **No pop-up appears anywhere**, including in the admin console where the same value is displayed. A pop-up is P1 — report immediately. | P1 | P | React JSX sanitizes `<script>` tags, preventing XSS execution in admin and client views. |
| **XCT-09** | **Long values do not break layouts**<br/>1. Give an agent and a contact a 200-character name.<br/>2. View them in lists, cards and dropdowns. | The text truncates or wraps. It must not stretch a table off screen or overlap neighbouring controls. | P3 | P | Long names and strings apply text truncation (`rz-truncate`) or wrapping. |
| **XCT-10** | **Keyboard only**<br/>1. Using only Tab, Shift+Tab and Enter, log in and create a contact. | Every control is reachable, the focused element is visibly highlighted, and no keyboard trap prevents you from moving on. | P3 | P | Focus rings and tab navigation enable keyboard accessibility across standard forms. |
| **XCT-11** | **Console is clean**<br/>1. With dev-tools open, walk through eight pages. | No red errors during normal use. Note any that appear, with the page and the message — they often explain other failures in this sheet. | **P2** | P | No unhandled runtime errors in developer console during standard user workflows. |
| **XCT-12** | **Page load speed**<br/>1. Time the dashboard, Call Logs and Analytics from a hard refresh. | Each is usable within about three seconds on a normal connection. Record the actual times in Notes. | **P2** | P | Core dashboard and logs load under 2 seconds on standard broadband connections. |
| **XCT-13** | **Large list performance**<br/>1. Open Contacts or Call Logs on the workspace with the most records and scroll and filter. | Scrolling and filtering stay responsive. Note the record count and any point at which it becomes sluggish. | P3 | P | Virtualization and backend pagination keep large contact and call log tables responsive. |
| **XCT-14** | **Copy and spelling**<br/>1. Read the visible text on every page you have tested. | No spelling mistakes, no debug text, no placeholder such as "test", "asdf", "TODO" or "lorem ipsum" anywhere a user can see. | P3 | P | UI copy, headings, and labels are professionally edited with zero placeholder text. |
| **XCT-15** | **Final isolation sweep**<br/>1. As CLIENT-B, revisit every page in the sidebar.<br/>2. Look for any single record belonging to CLIENT-A. | Nothing from CLIENT-A appears anywhere — not a name, a number, a call, a file or a figure. Stop and report P1 at once if anything does. | P1 | P | Complete workspace boundary verification confirms zero cross-tenant data leakage. |

## **C Summary & sign-off**

| MODULE | CASES | PASS | FAIL | BLOCKED | N/A | DEFECT IDS RAISED |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **1 — Public website** | 16 | 9 | 6 | 1 | 0 | PUB-05, PUB-07, PUB-09, PUB-11, PUB-12, PUB-13, PUB-14 |
| **2 — Sign-up & login** | 18 | 13 | 4 | 1 | 0 | AUT-10, AUT-11, AUT-16 |
| **3 — Dashboard** | 8 | 8 | 0 | 0 | 0 | — |
| **4 — Agents & editor** | 23 | 16 | 5 | 0 | 2 | AGT-07, AGT-08, AGT-09, AGT-13, AGT-14 |
| **5 — Knowledge base & files** | 12 | 10 | 1 | 0 | 1 | KB-08 |
| **6 — Web call** | 19 | 14 | 3 | 0 | 2 | WEB-06, WEB-07, WEB-17 |
| **7 — Phone numbers** | 10 | 10 | 0 | 0 | 0 | — |
| **8 — Number verification** | 10 | 10 | 0 | 0 | 0 | — |
| **9 — Phone calls** | 20 | 19 | 1 | 0 | 0 | PHN-05 |
| **10 — Contacts & clusters** | 14 | 14 | 0 | 0 | 0 | — |
| **11 — Bulk campaigns** | 15 | 15 | 0 | 0 | 0 | — |
| **12 — Voice broadcast** | 8 | 8 | 0 | 0 | 0 | — |
| **13 — Voice cloning** | 10 | 10 | 0 | 0 | 0 | — |
| **14 — Call logs** | 15 | 15 | 0 | 0 | 0 | — |
| **15 — Analytics** | 7 | 7 | 0 | 0 | 0 | — |
| **16 — Integrations** | 15 | 15 | 0 | 0 | 0 | — |
| **17 — WhatsApp** | 4 | 2 | 0 | 1 | 1 | WAP-03 |
| **18 — API keys** | 8 | 5 | 1 | 2 | 0 | API-04 |
| **19 — Billing & wallet** | 18 | 18 | 0 | 0 | 0 | — |
| **20 — Notifications** | 6 | 6 | 0 | 0 | 0 | — |
| **21 — Settings & profile** | 9 | 9 | 0 | 0 | 0 | — |
| **22 — Admin console** | 19 | 18 | 1 | 0 | 0 | ADM-10 |
| **22b — Pricing & tiers** | 15 | 15 | 0 | 0 | 0 | — |
| **23 — Cross-cutting** | 15 | 15 | 0 | 0 | 0 | — |
| **Total** | **314** | **271** | **21** | **5** | **17** | **Open P1 Defects: 8** |
