import { Link } from 'react-router-dom';
import { PRIVACY_POLICY_TEXT } from './privacyPolicyText';

type PolicySection = { title: string; paragraphs?: string[]; items?: string[] };

function PolicyDocument() {
  const documentText = PRIVACY_POLICY_TEXT
    .replace(/^Spandan Privacy Policy\n\n?/, '')
    .trim();

  const blocks = documentText.split(/\n\s*\n/);

  return (
    <div className="privacy-document">
      {blocks.map((block, index) => {
        const lines = block.split('\n');
        const firstLine = lines[0].trim();
        const text = lines.map((line) => line.trim()).join(' ');
        const isMainHeading = /^\d+\.\s/.test(firstLine);
        const isSubheading = /^\d+\.\d+\s/.test(firstLine);
        const isBulletBlock = lines.some((line) => /^[●•]\s*/.test(line.trim()));

        if (isMainHeading || isSubheading) {
          return isMainHeading ? (
            <h2 className="privacy-section-title" key={index}>{text}</h2>
          ) : (
            <h3 className="privacy-subsection-title" key={index}>{text}</h3>
          );
        }

        if (isBulletBlock) {
          const bulletItems: string[] = [];
          lines.forEach((line) => {
            const trimmedLine = line.trim();
            if (/^[●•]\s*/.test(trimmedLine)) {
              bulletItems.push(trimmedLine.replace(/^[●•]\s*/, ''));
            } else if (bulletItems.length > 0) {
              bulletItems[bulletItems.length - 1] += ` ${trimmedLine}`;
            }
          });

          return (
            <ul className="privacy-list" key={index}>
              {bulletItems.map((item, itemIndex) => (
                <li key={itemIndex}>{item}</li>
              ))}
            </ul>
          );
        }

        return <p key={index}>{text}</p>;
      })}
    </div>
  );
}

const SECTIONS: PolicySection[] = [
  {
    title: '1. Definitions and scope',
    paragraphs: [
      'For purposes of this Privacy Policy, Personal Information means information that identifies, relates to, describes, or could reasonably be associated with an identified or identifiable individual. Depending on the jurisdiction, this may also be called Personal Data or a similar term.',
      'This Policy applies globally to Personal Information processed when you create or use an account or workspace; use our websites, applications, APIs, or Services; create, configure, test, or interact with AI agents; use voice, telephony, or WhatsApp functionality; connect integrations; upload files or knowledge-base content; or contact our support or sales teams.',
      'If Spandan processes Personal Information solely on behalf of a business customer, the applicable customer agreement or Data Processing Agreement may govern that processing. The organization may act as controller while Spandan acts as processor, service provider, or equivalent entity.',
    ],
  },
  {
    title: '2. Information we collect',
    paragraphs: [
      'We collect information you provide directly, information generated automatically through your use of the Services, and information received from customers, integrations, service providers, and other third parties. The information depends on the Services and features you use, your configuration, and the nature of your interactions with Spandan.',
    ],
    items: [
      'Account and workspace information, including your name, email address, phone number, credentials, profile, organization, workspace settings, members, roles, permissions, billing, subscription, payment history, API keys, and support communications.',
      'Agent configuration and user content, including agent names, personas, system instructions, welcome messages, conversation flows, language and voice settings, prompts, rules, knowledge-base content, uploaded files, test conversations, form data, API payloads, and content received through integrations.',
      'Voice and telephony information, including caller and recipient numbers, assigned numbers, call date and time, duration, status, identifiers, recordings where enabled, audio streams, transcripts, summaries, extracted information, appointment or lead information, and technical connection details.',
      'WhatsApp information, including business account and phone-number information, contacts, messages, templates, keywords, automation rules, broadcast campaigns, delivery and engagement information, webhook events, media, and other supported content.',
      'Knowledge-base information, including PDFs, text documents, structured information, internal documentation, FAQs, policies, product information, and reference materials. This may be stored, indexed, embedded, searched, analyzed, and delivered to an agent.',
      'Information from integrations, including data from Google Calendar, Google Meet, Google Sheets, Cal.com, Calendly, Salesforce, HubSpot, Slack, Genesys, Make, Zapier, GoHighLevel, Twilio, Meta/WhatsApp, and other connected services according to the permissions granted.',
      'OAuth credentials and integration tokens, including access tokens, refresh tokens, client identifiers, API credentials, and similar authentication information. Where supported, sensitive credentials are encrypted or otherwise protected at rest.',
      'Usage and technical information, including IP address, browser and operating system, device type and identifiers, application version, time zone, approximate location, access times, pages and features used, actions, API activity, authentication events, connection details, errors, diagnostics, and security or fraud signals.',
      'Billing and payment information, including billing name and address, subscription and wallet information, credits, transaction and invoice details, payment status, currency, and exchange-rate information. Payments may be processed by providers such as Razorpay.',
      'Communications, appointment, and lead information, including names, email addresses, phone numbers, organization details, booking dates and times, time zones, meeting details, scheduling preferences, form responses, messages, attachments, screenshots, recordings, logs, and technical details.',
    ],
  },
  {
    title: '3. How we use Personal Information',
    paragraphs: ['We use Personal Information for the following purposes:'],
    items: [
      'Provide the Services, create and manage accounts and workspaces, authenticate users, operate AI agents, process conversations, calls, recordings, transcripts, summaries, analytics, WhatsApp workflows, knowledge bases, integrations, appointments, billing, wallets, subscriptions, invoices, and customer support.',
      'Improve and develop Spandan by monitoring reliability, testing functionality, analyzing performance and latency, diagnosing problems, developing features, and improving AI and automation capabilities where permitted by agreements, settings, and law.',
      'Detect fraud, prevent abuse, identify unauthorized access, protect accounts and infrastructure, investigate suspicious activity, enforce our terms and policies, maintain system integrity, and prevent illegal or harmful activity.',
      'Respond to support requests, send service notifications, security alerts, account and billing information, important changes, and marketing communications where permitted. You may unsubscribe from non-essential marketing communications.',
      'Comply with laws, respond to lawful requests, establish or defend legal claims, protect our rights and users, meet regulatory requirements, and maintain business, financial, accounting, tax, audit, and compliance records.',
    ],
  },
  {
    title: '4. AI processing',
    paragraphs: [
      'Spandan provides AI-powered conversational and automation Services using third-party and configurable AI technologies. Depending on your configuration, information may be processed by OpenAI, Google Gemini, Azure OpenAI, Groq, Sarvam, xAI, ElevenLabs, Deepgram, Fish Audio, Google Cloud, Cartesia, and other providers as our Services evolve.',
      'The providers used depend on the agent configuration, model, voice, feature, geographic location, and functionality selected. Information sent to an AI or speech provider may include prompts, conversation content, audio, transcripts, knowledge-base material, configuration information, or other information necessary for the requested operation.',
    ],
  },
  {
    title: '5. Voice cloning',
    paragraphs: [
      'Voice-cloning information may include voice recordings, voice samples, voice models, voice identifiers, and configuration information. Customers must have the necessary rights, permissions, and consent to provide a person\'s voice for cloning or synthetic voice generation.',
      'Spandan does not authorize cloning a person\'s voice without appropriate permission or using voice-cloning functionality for unlawful, fraudulent, deceptive, impersonating, abusive, or harmful purposes. Depending on applicable law, voice information may constitute biometric or sensitive Personal Information.',
    ],
  },
  {
    title: '6. How we share Personal Information',
    paragraphs: [
      'We may disclose Personal Information to service providers that support cloud hosting, databases and storage, AI and speech processing, telephony, WhatsApp services, email delivery, payments, analytics, security, monitoring, customer support, scheduling, and integrations. These providers process information according to their role, applicable agreements, our instructions, or applicable law.',
      'We may also disclose information when required by law, in response to valid legal requests, to protect rights or safety, investigate abuse, or in connection with a merger, acquisition, financing, or sale of assets.',
    ],
  },
  {
    title: '7. International data processing',
    paragraphs: [
      'Personal Information may be stored outside your country, accessed from other jurisdictions, or processed by international AI, cloud, telephony, payment, security, analytics, and other providers. Where required by law, we use safeguards such as contractual protections, recognized transfer mechanisms, adequacy decisions, consent, or other lawful mechanisms.',
    ],
  },
  {
    title: '8. Business customers and data processing',
    paragraphs: [
      'Business customers may provide information about customers, employees, contacts, leads, callers, WhatsApp users, and other individuals. The business customer may determine the purposes and means of processing, while Spandan processes information on its behalf.',
      'Customers are responsible for having an appropriate legal basis, providing required notices, obtaining consent, complying with telecommunications, recording, marketing, messaging, WhatsApp, and voice-cloning requirements, responding to privacy requests, and ensuring that data and knowledge-base content are lawfully obtained and used.',
    ],
  },
  {
    title: '9. Cookies and similar technologies',
    paragraphs: [
      'Spandan may use cookies, local storage, pixels, and SDKs for authentication, preferences, security, analytics, functionality, communications, and performance. Depending on your location, you may be asked to consent to certain non-essential technologies. Your browser can provide controls for managing cookies, although disabling them may affect functionality.',
    ],
  },
  {
    title: '10. Data retention',
    paragraphs: [
      'We retain Personal Information for as long as reasonably necessary to provide the Services, maintain accounts and workspaces, complete transactions, meet contractual and legal obligations, maintain security, prevent fraud and abuse, resolve disputes, and protect our rights. Deleted information may remain temporarily in backups or be retained where legally required or otherwise permitted.',
    ],
  },
  {
    title: '11. Account and data controls',
    paragraphs: ['Depending on the Services you use, you may be able to:'],
    items: [
      'Access, update, correct, export, or delete account information and certain content.',
      'Delete or deactivate your account, manage workspace members and permissions, and manage integrations.',
      'Create, rotate, disable, or delete API keys; manage agent configurations and knowledge-base files; and manage conversations and call records where supported.',
      'Control available AI or data-processing settings and request or download available account information.',
    ],
  },
  {
    title: '12. Your privacy rights',
    paragraphs: [
      'Depending on where you live, you may have rights including:',
      'We may need to verify your identity before processing certain requests.',
    ],
    items: [
      'Access to information about whether and how we process your Personal Information and a copy of that information where required.',
      'Correction of inaccurate or incomplete Personal Information and deletion subject to legal exceptions and retention requirements.',
      'Restriction or objection to certain processing and portability of certain Personal Information in a structured, commonly used, machine-readable format where required.',
      'Withdrawal of consent where processing relies on consent, marketing opt-out, and the right to complain to an applicable data protection authority.',
    ],
  },
  {
    title: '13. Grievance and privacy requests',
    paragraphs: [
      'If you have a privacy concern, complaint, or grievance, contact us through the Contact page. Please provide enough information for us to understand your request. We will review and respond within the period required by applicable law. Where applicable, you may also contact the relevant supervisory authority.',
      'Company: Spandan. Email: Info@mannmate.com.',
    ],
  },
  {
    title: '14. Children\'s privacy',
    paragraphs: [
      'The Services are not intended for children who are not legally permitted to use them under applicable law. We do not knowingly collect Personal Information from children in violation of applicable law. Customers must not intentionally use Spandan to collect, process, clone, synthesize, or otherwise use children\'s Personal Information or voice information unlawfully.',
      'If we become aware that we received a child\'s Personal Information where collection was not permitted, we will take reasonable steps to investigate and delete it where required.',
    ],
  },
  {
    title: '15. Security',
    paragraphs: [
      'We use reasonable technical, administrative, and organizational safeguards designed to protect Personal Information. These may include encryption in transit and, where supported, at rest; access controls; authentication; role-based permissions; credential protection; secure API authentication; monitoring and logging; rate limiting; security reviews; audit trails; and infrastructure security controls.',
      'No online service or electronic storage system can guarantee absolute security. Avoid submitting information through the Services that you are not authorized to disclose.',
    ],
  },
  {
    title: '16. API keys and credentials',
    paragraphs: [
      'Customers are responsible for keeping API keys, passwords, access tokens, and similar credentials confidential; rotating them when necessary; and managing access appropriately. Spandan may store encrypted integration credentials where necessary to provide the requested Service.',
    ],
  },
  {
    title: '17. Analytics and service monitoring',
    paragraphs: [
      'We may collect and analyze technical and usage information to understand service performance, call latency, AI response performance, provider availability, feature usage, errors, campaign performance, system health, and security events. Where practical and appropriate, we may aggregate or de-identify information so that it no longer reasonably identifies an individual.',
    ],
  },
  {
    title: '18. Automated decisions and AI outputs',
    paragraphs: [
      'Spandan uses AI to generate responses, transcriptions, summaries, classifications, extracted information, recommendations, and other workflow-related outputs. AI-generated information may be incomplete, inaccurate, or incorrect. Customers should not rely on it as the sole basis for decisions with significant legal, financial, medical, employment, safety, or other serious consequences without appropriate human review.',
    ],
  },
  {
    title: '19. Marketing communications',
    paragraphs: [
      'We may send security notifications, billing notices, service announcements, account notifications, and notices of important changes. Where permitted by law, we may also send promotional communications. You may unsubscribe from promotional communications, but essential service communications may continue.',
    ],
  },
  {
    title: '20. Third-party websites and services',
    paragraphs: [
      'The Services may contain links to or integrations with payment, telecommunications, AI, Meta/WhatsApp, calendar, CRM, scheduling, automation, and other third-party services. Spandan does not control their privacy practices. When you use a third-party service, it may collect and process information under its own policy and terms.',
    ],
  },
  {
    title: '21. Data deletion',
    paragraphs: [
      'You may request deletion of Personal Information associated with your account, subject to applicable law and legitimate retention requirements. Deletion may include account information, user content, voice information, and conversation information where supported, but may not immediately remove information from backups, security logs, financial records, or other systems where retention is required or permitted.',
      'Where Spandan processes information on behalf of a business customer, deletion requests may need to be directed to that customer.',
    ],
  },
  {
    title: '22. Changes to this Privacy Policy',
    paragraphs: [
      'We may update this Privacy Policy to reflect changes to our Services, technologies, integrations, business practices, legal or regulatory requirements, security practices, or operations. We will post the revised version here and update the date. When material changes are made, we may provide notice through the Services, by email, or by another appropriate method where required by law.',
    ],
  },
  {
    title: '23. Data controller and processor roles',
    paragraphs: [
      'For information relating to your Spandan account, direct communications, billing, security, website operation, and service administration, Spandan may act as a data controller or equivalent responsible entity.',
      'For information a business customer provides for AI agents, calls, WhatsApp workflows, CRM integrations, campaigns, scheduling, or other customer-configured functionality, the business customer may determine the purposes and means of processing and Spandan may act as a data processor, service provider, or equivalent entity. The applicable agreement, DPA, and privacy laws determine the respective responsibilities.',
    ],
  },
  {
    title: '24. Lawful processing',
    paragraphs: ['Where applicable law requires a legal basis, we may rely on:'],
    items: [
      'Performance of a contract to provide requested Services or fulfill contractual obligations.',
      'Legal obligations, including laws, regulations, court orders, tax, accounting, and other requirements.',
      'Legitimate interests such as security, fraud prevention, service improvement, and business administration, where those interests do not override applicable rights.',
      'Consent, protection of vital interests in limited circumstances, and other lawful grounds recognized by the applicable jurisdiction.',
    ],
  },
  {
    title: '25. Important service-specific responsibilities',
    paragraphs: [
      'Customers are responsible for using automated communication and AI agent tools lawfully. This includes obtaining consent before recording or transcribing calls; following rules for automated and bulk calling; honoring do-not-call and opt-out requirements; providing required AI, recording, and automation disclosures; obtaining permission for voice cloning; complying with WhatsApp and messaging requirements; lawfully obtaining knowledge-base, CRM, calendar, and integrated data; maintaining privacy notices; and practicing data minimization.',
      'Spandan provides the technology and infrastructure that enable these functions. The customer remains responsible for determining whether and how a particular use is lawful.',
    ],
  },
  {
    title: '26. Additional regional rights',
    paragraphs: [
      'Privacy laws differ between countries and regions. Depending on your location, additional rights or disclosures may apply under laws in the European Economic Area, United Kingdom, Switzerland, United States, India, and other jurisdictions. Where applicable law grants rights or protections that differ from this general Policy, Spandan will handle Personal Information according to the requirements applicable to the relevant individual and processing activity.',
    ],
  },
  {
    title: '27. Contact us',
    paragraphs: [
      'For questions about this Privacy Policy, our privacy practices, or the processing of your Personal Information, contact us through our Contact page. Business customers requiring a Data Processing Agreement, privacy documentation, security documentation, or information about our data-processing practices may use the same contact channel.',
      'Spandan. Email: Info@mannmate.com. Website: https://spandan.mannmate.com.',
    ],
  },
];

export default function PrivacyPolicy() {
  return (
    <main className="rz-page privacy-page">
      <div className="container">
        <div className="breadcrumb">
          <Link to="/">Home</Link>
          <span>›</span>
          <span style={{ color: 'var(--tx)' }}>Privacy Policy</span>
        </div>

        <div className="privacy-header">
          <div className="rz-eyebrow-pill">Legal</div>
          <h1 className="rz-h1">Privacy Policy</h1>
          <p className="privacy-updated">Effective Date: August 25, 2026 · Last Updated: August 25, 2026</p>
        </div>

        <article className="privacy-content" aria-label="Spandan Privacy Policy">
          <PolicyDocument />
        </article>
      </div>

      <style>{`
        .privacy-header { max-width: 760px; padding: 62px 0 42px; }
        .privacy-header .rz-h1 { margin: 18px 0 14px; font-size: clamp(36px, 5vw, 58px); }
        .privacy-updated { color: var(--tx-3); font: 12px var(--ff-m); margin: 22px 0 0; }
        .privacy-content { max-width: 760px; padding: 0 0 88px; color: var(--tx-2); }
        .privacy-content { font: 16px/1.75 var(--ff-b); }
        .privacy-content p { margin: 0 0 22px; }
        .privacy-document-intro { padding-bottom: 10px; }
        .privacy-section-title { margin: 48px 0 16px; color: var(--tx); font: 700 26px/1.25 var(--ff-d); letter-spacing: 0; }
        .privacy-subsection-title { margin: 32px 0 12px; color: var(--tx); font: 600 19px/1.35 var(--ff-d); letter-spacing: 0; }
        .privacy-list { display: block; list-style-type: disc; margin: 0 0 24px; padding-left: 28px; }
        .privacy-list li { margin: 0 0 10px; padding-left: 5px; }
        @media (max-width: 640px) {
          .privacy-header { padding: 42px 0 32px; }
          .privacy-content { padding-bottom: 56px; }
          .privacy-content { font-size: 15px; line-height: 1.7; }
          .privacy-section-title { margin-top: 38px; font-size: 23px; }
          .privacy-subsection-title { font-size: 18px; }
        }
      `}</style>
    </main>
  );
}
