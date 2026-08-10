import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AgentConfig, getDefaultFlowItems, getDefaultWelcomeMessage } from '../lib/agentStore';
import { toast } from 'sonner';
import { whapi } from '../lib/whapi';
import { BRAND } from '../lib/brand';


/**
 * Per-category glyph and tint for the use-case template cards.
 *
 * Glyphs rather than an icon library: the Spandan surfaces already speak in
 * mono marks (◷ ◈ ♪ ▤ in the assistant rows), and a text glyph inherits the
 * tint token directly. Colours are drawn from the state accents so the grid
 * stays inside the palette instead of introducing a sixth decorative hue.
 */
const CATEGORY_META: Record<string, { icon: string; fg: string; bg: string }> = {
  'Lead Generation': { icon: '◎', fg: 'var(--cyan-fg)', bg: 'rgba(14,179,158,.12)' },
  Appointments:      { icon: '▦', fg: 'var(--violet)',  bg: 'rgba(129,140,248,.12)' },
  Support:           { icon: '✆', fg: 'var(--lime)',    bg: 'rgba(52,211,153,.12)' },
  Negotiation:       { icon: '⇄', fg: 'var(--coral)',   bg: 'rgba(249,115,22,.12)' },
  Collections:       { icon: '▣', fg: 'var(--warn)',    bg: 'rgba(245,158,11,.12)' },
};
const CATEGORY_FALLBACK = { icon: '◈', fg: 'var(--tx-2)', bg: 'rgba(107,130,158,.12)' };

/**
 * The one-line summary shown on a template card.
 *
 * Every seeded prompt opens with a sentence that already describes the agent
 * ("Create a voice AI agent for outbound lead generation campaigns…"), so the
 * card description is derived from it rather than authored a second time —
 * one source of truth, and new templates get a card for free.
 */
function templateDescription(prompt: string): string {
  const firstLine = prompt.split('\n')[0].trim();
  /*
    The optional [a-z]+ absorbs an adjective between "voice AI" and the noun —
    "Create a voice AI educational agent that teaches children…" is phrased that
    way and otherwise falls through with the boilerplate still attached.
  */
  const stripped = firstLine
    .replace(/^create\s+(?:a|an)\s+voice\s+ai\s+(?:[a-z]+\s+)?(?:agent|assistant)\s+(?:for|to|that)\s+/i, '')
    .replace(/^create\s+(?:a|an)\s+voice\s+ai\s+(?:[a-z]+\s+)?(?:agent|assistant)\s*/i, '')
    .trim();
  const text = stripped || firstLine;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export default function Dashboard() {
  const [prompt, setPrompt] = useState('');
  const [agentTitle, setAgentTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();

  /*
    Removed alongside the composer's orphaned "⋮" menu: a dropdown, its
    click-outside listener, a copy handler and a `hardcodedAssistant` literal
    (id '131000'). The menu rendered inside the use-case templates area rather
    than on any agent card, and its Copy action POSTed that literal to /agents —
    so using it created a real agent named "Outbound Lead Qualification Agent
    (Copy)" out of demo data. The agent rows carry their own Delete/Edit
    actions, which is where these controls belong.
  */

  const handleDeleteAssistant = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!window.confirm('Delete this assistant? Its attached knowledge-base files, call history, and recordings will also be permanently deleted.')) return;
    try {
      await whapi.del(`/agents/${id}`);
      setAgents(prev => prev.filter(a => a.id !== id));
      toast.success('Agent deleted');
    } catch (err) {
      console.error('Failed to delete on backend', err);
      toast.error(err instanceof Error ? err.message : 'Failed to delete agent on the server.');
    }
  };

  const [agentsError, setAgentsError] = useState<string | null>(null);
  const [agentsLoading, setAgentsLoading] = useState(true);
  const fetchAgentsRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // The server is the ONLY source of truth. The old localStorage fallback
    // ('voice_ai_agents_v1') made failures look like success and produced
    // phantom agents that vanished on refresh — removed entirely.
    const fetchAgents = async () => {
      setAgentsLoading(true);
      setAgentsError(null);
      try {
        const backendAgents = await whapi.get<AgentConfig[]>('/agents');
        setAgents(Array.isArray(backendAgents) ? backendAgents : []);
      } catch (err) {
        console.error('Failed to fetch agents from backend', err);
        setAgentsError(err instanceof Error ? err.message : 'Could not load your agents from the server.');
      } finally {
        setAgentsLoading(false);
      }
    };
    fetchAgentsRef.current = fetchAgents;
    fetchAgents();
    try { localStorage.removeItem('voice_ai_agents_v1'); } catch { /* ignore */ }
  }, []);

  const [enhanceError, setEnhanceError] = useState('');


  const generateAgentName = (text: string) => {
    let title = text
      // A pasted system-prompt often starts with markdown/meta boilerplate
      // ("## System Instruction For ...") — strip it so it never becomes the
      // agent's name. Take only the first line, drop markdown/formatting chars.
      .split('\n')[0]
      .replace(/[#*_`>~]/g, ' ')
      .replace(/^\s*(system\s+instructions?|instructions?|prompt|persona|role|guidelines?)\s*(for|to|:|-|–)?\s*/i, '')
      .replace(/^create\s+(a\s+)?voice\s+ai\s+agent\s+for\s+/i, '')
      .replace(/^create\s+(an?\s+)?ai\s+agent\s+for\s+/i, '')
      .replace(/^create\s+(a\s+)?voice\s+ai\s+assistant\s+for\s+/i, '')
      .replace(/^create\s+/i, '')
      .trim();

    title = title
      .replace(/\bassistance\b/gi, '')
      .replace(/\bassistant\b/gi, '')
      .replace(/\bagent\b/gi, '')
      // Drop any residual punctuation/symbols so only clean words remain.
      .replace(/[^A-Za-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    title = title
      .split(/\s+/)
      .filter(Boolean)
      // A fallback name, not a summary — long prompts must never become the
      // agent's name wholesale.
      .slice(0, 5)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');

    return title ? `${title} Agent` : 'Voice AI Agent';
  };

  const handleEnhance = async () => {
    if (!prompt.trim()) return;
    setEnhanceError('');
    try {
      setEnhancing(true);
      // Authenticated workspace-scoped call (endpoint is no longer public)
      const data = await whapi.post<any>('/llm/enhance-prompt', { prompt });
      console.log('Enhance Response:', data);
      console.log('enhancedPrompt:', data.enhancedPrompt);
      console.log('Type:', typeof data.enhancedPrompt);

      if (data.enhancedPrompt) {
        const enhancedText =
          typeof data.enhancedPrompt === 'string'
            ? data.enhancedPrompt
            : data.enhancedPrompt.message || '';

        setPrompt(enhancedText);

        if (!agentTitle) {
          setAgentTitle(generateAgentName(enhancedText));
        }
      }
    } catch (err) {
      console.error(err);
      setEnhanceError(err instanceof Error ? err.message : 'Enhancement failed');
    } finally {
      setEnhancing(false);
    }
  };



  const handleCreate = async () => {
    if (!prompt.trim()) return;
    setCreating(true);

    const name =
      agentTitle ||
      generateAgentName(prompt);

    let welcomeMsg = '';
    let defaultFlow: any[] = [];
    // Full config generated from the user's ACTUAL description + category:
    // welcome + flow, plus languages, voice (TTS), AI model and STT provider.
    let genConfig: {
      name?: string;
      languages?: string[];
      aiModel?: string;
      transcription?: string;
      voice?: string;
      callDirection?: string;
      // Human first name the agent speaks, separate from the display `name`.
      personaName?: string;
      postCallVariables?: { key: string; description: string }[];
    } = {};
    try {
      const generated = await whapi.post<any>('/llm/generate-flow', {
        name,
        prompt,
        category: selectedCategory || undefined,
      });
      // A tailored flow is the valuable part — keep it (and voice/languages/
      // variables) even when the backend dropped a bad welcome. The welcome
      // falls back to a use-case default below rather than discarding the rest.
      if (generated && Array.isArray(generated.flowItems) && generated.flowItems.length) {
        if (typeof generated.welcomeMessage === 'string' && generated.welcomeMessage.trim()) {
          welcomeMsg = generated.welcomeMessage;
        }
        defaultFlow = generated.flowItems;
        genConfig = generated;
      }
    } catch (genErr) {
      console.warn('Flow generation failed, using a generic template', genErr);
      toast.warning('AI flow generation failed — a generic template was used. Edit the agent to customize its flow.');
    }

    // Fallbacks if LLM generation failed or returned incomplete data
    if (!welcomeMsg) {
      welcomeMsg = getDefaultWelcomeMessage(name);
    }
    if (!defaultFlow || defaultFlow.length === 0) {
      defaultFlow = getDefaultFlowItems(name);
    }

    try {
      const newAgent = await whapi.post<AgentConfig>('/agents', {
        // A title the user typed themselves wins; otherwise prefer the
        // LLM-chosen name (short, or exactly the name the prompt mentioned)
        // over the crude keyword fallback.
        name: agentTitle || genConfig.name || name,
        welcomeMessage: welcomeMsg,
        flowItems: defaultFlow,
        aiModel: genConfig.aiModel || 'GPT-4.1-Mini',
        voice: genConfig.voice || 'Google - Aoede (female)',
        ...(genConfig.languages?.length ? { languages: genConfig.languages } : {}),
        // `transcription` is the Agent column; `sttProvider` is what the live
        // web-call runtime reads from settings — keep them in sync.
        ...(genConfig.transcription
          ? { transcription: genConfig.transcription, sttProvider: genConfig.transcription }
          : {}),
        // Inferred from the prompt: does this agent place calls (OUTBOUND)
        // or receive them (INBOUND)? Drives the greeting style.
        ...(genConfig.callDirection ? { callDirection: genConfig.callDirection } : {}),
        // The human first name the agent SPEAKS ("Purva"), kept separate from
        // the display label ("Purva - Hospital Receptionist"), which is a 2-5
        // word title and cannot be said aloud. Without this the runtime had to
        // guess from the label, and when it couldn't it invented an unrelated
        // name — so the agent introduced itself as someone else.
        ...(genConfig.personaName ? { personaName: genConfig.personaName } : {}),
        // Post-Call tab: extraction variables tailored to the use case (e.g.
        // appointment_date/appointment_time for a booking agent) instead of
        // the generic defaults.
        ...(genConfig.postCallVariables?.length
          ? {
              postCallConfigs: [{
                id: Date.now().toString(),
                deliveryMethod: '',
                url: '',
                email: '',
                triggerStatuses: ['Completed', 'Voicemail Detected'],
                includeCallSummary: true,
                includeFullConversation: true,
                includeSentimentAnalysis: true,
                includeExtractedInformation: true,
                extractedVariables: genConfig.postCallVariables.map((v) => ({
                  id: v.key,
                  key: v.key,
                  description: v.description,
                })),
              }],
            }
          : {}),
      });

      setAgents(prev => [newAgent, ...prev]);
      setPrompt('');
      setAgentTitle('');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (err) {
      console.error('Failed to create agent on backend', err);
      toast.error(err instanceof Error ? err.message : 'Failed to create agent — it was NOT saved. Please try again.');
    } finally {
      setCreating(false);
    }
  };




  const filteredAgents = agents.filter(agent =>
    agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    agent.language.toLowerCase().includes(searchQuery.toLowerCase()) ||
    agent.llm.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const useCases = {
    "Lead Generation": [
      {
        name: "Cold Calling Leads",
        prompt: `Create a voice AI agent for outbound lead generation campaigns targeting potential business customers.

Personality:
- Professional and confident
- Friendly and engaging
- Persuasive without being aggressive
- Customer-focused

Capabilities:
- Introduce company products and services
- Verify prospect information
- Identify decision makers
- Understand business requirements
- Discover current challenges
- Capture lead details
- Qualify prospects
- Schedule follow-up meetings

Call Flow:
1. Introduce yourself and company
2. Verify decision-maker availability
3. Explain purpose of the call
4. Ask discovery questions
5. Understand current business challenges
6. Determine interest level
7. Capture lead information
8. Schedule follow-up meeting if qualified

Goals:
- Generate qualified leads
- Increase sales opportunities
- Improve prospect engagement
- Book follow-up meetings` },
      {
        name: "SaaS Demo Booking",
        prompt: `Create a voice AI agent for scheduling software product demonstrations for qualified prospects.

Personality:
- Professional and consultative
- Helpful and knowledgeable
- Friendly and approachable
- Solution-oriented

Capabilities:
- Qualify inbound leads
- Identify company size
- Understand business pain points
- Explain software benefits
- Collect business requirements
- Schedule product demonstrations
- Send meeting confirmations
- Answer basic product questions

Call Flow:
1. Welcome the prospect
2. Understand their business needs
3. Ask qualification questions
4. Identify current challenges
5. Explain product value
6. Confirm interest level
7. Schedule demo meeting
8. Send confirmation details

Goals:
- Increase demo bookings
- Improve lead qualification
- Reduce manual scheduling
- Increase product adoption opportunities` },
      {
        name: "Real Estate Lead Qualification",
        prompt: `Create a voice AI agent for qualifying real estate buyers and sellers.

Personality:
- Professional and trustworthy
- Friendly and patient
- Consultative and informative
- Customer-focused

Capabilities:
- Collect buyer requirements
- Capture budget information
- Identify preferred locations
- Understand property preferences
- Determine buying timeline
- Qualify potential customers
- Schedule site visits
- Connect leads with agents

Call Flow:
1. Greet the customer
2. Understand property requirements
3. Ask about budget range
4. Capture location preferences
5. Determine purchase timeline
6. Assess seriousness of inquiry
7. Schedule site visit
8. Transfer qualified lead to agent

Goals:
- Generate qualified property leads
- Increase site visit bookings
- Improve lead conversion
- Support sales team efficiency` },
      {
        name: "Insurance Lead Qualification",
        prompt: `Create a voice AI agent for insurance lead generation and customer qualification.

Personality:
- Professional and trustworthy
- Helpful and informative
- Patient and courteous
- Customer-focused

Capabilities:
- Understand insurance requirements
- Collect customer information
- Explain policy benefits
- Assess eligibility
- Capture demographic details
- Identify insurance type needed
- Qualify leads
- Schedule advisor consultations

Call Flow:
1. Introduce insurance services
2. Understand customer needs
3. Collect personal information
4. Discuss insurance options
5. Determine eligibility
6. Explain key benefits
7. Qualify prospect
8. Schedule advisor meeting

Goals:
- Generate insurance-qualified leads
- Increase policy inquiries
- Improve advisor productivity
- Increase conversion rates` },
      {
        name: "Loan Eligibility Verification",
        prompt: `Create a voice AI agent for preliminary loan qualification and applicant verification.

Personality:
- Professional and compliant
- Respectful and courteous
- Detail-oriented
- Trustworthy

Capabilities:
- Verify applicant identity
- Collect employment details
- Capture income information
- Understand loan requirements
- Assess basic eligibility
- Explain loan process
- Schedule officer follow-up
- Record applicant information

Call Flow:
1. Verify customer identity
2. Understand loan requirement
3. Collect employment details
4. Capture income information
5. Assess preliminary eligibility
6. Explain next steps
7. Schedule loan officer callback
8. Confirm application details

Goals:
- Pre-qualify applicants
- Reduce manual verification effort
- Improve application processing
- Increase qualified loan applications` }
    ],

    "Appointments": [
      {
        name: "Doctor Appointment Booking",
        prompt: `Create a voice AI agent for healthcare appointment booking and patient scheduling.

Personality:
- Professional and courteous
- Patient and empathetic
- Organized and reliable
- Calm and reassuring

Capabilities:
- Schedule doctor appointments
- Check physician availability
- Reschedule appointments
- Cancel appointments
- Verify patient information
- Send appointment reminders
- Answer basic clinic questions
- Provide appointment instructions

Call Flow:
1. Greet the patient
2. Verify patient identity
3. Understand appointment requirement
4. Check doctor availability
5. Confirm appointment details
6. Provide preparation instructions
7. Send confirmation notification
8. Thank patient and close call

Goals:
- Reduce receptionist workload
- Improve appointment booking efficiency
- Reduce no-show rates
- Enhance patient experience` },
      {
        name: "Dental Clinic Booking",
        prompt: `Create a voice AI agent for dental appointment management and patient scheduling.

Personality:
- Friendly and caring
- Professional and patient
- Helpful and organized
- Reassuring and polite

Capabilities:
- Schedule dental appointments
- Manage cancellations
- Reschedule visits
- Verify patient details
- Send appointment reminders
- Explain clinic policies
- Answer basic service questions
- Confirm treatment appointments

Call Flow:
1. Welcome the patient
2. Identify appointment needs
3. Verify patient information
4. Check dentist availability
5. Confirm appointment slot
6. Provide clinic instructions
7. Send appointment confirmation
8. Thank the patient

Goals:
- Increase booking efficiency
- Reduce missed appointments
- Improve patient satisfaction
- Streamline scheduling operations` },
      {
        name: "Salon Appointment Scheduling",
        prompt: `Create a voice AI agent for salon appointment booking and customer scheduling.

Personality:
- Friendly and welcoming
- Professional and energetic
- Helpful and customer-focused
- Polite and attentive

Capabilities:
- Schedule salon appointments
- Recommend salon services
- Manage stylist schedules
- Handle cancellations
- Process rescheduling requests
- Send appointment reminders
- Confirm service selections
- Answer customer inquiries

Call Flow:
1. Welcome the customer
2. Understand required services
3. Check stylist availability
4. Recommend suitable slots
5. Confirm appointment details
6. Explain salon policies
7. Send booking confirmation
8. Thank the customer

Goals:
- Increase appointment bookings
- Improve customer experience
- Optimize stylist schedules
- Reduce appointment conflicts` },
      {
        name: "Interview Scheduling",
        prompt: `Create a voice AI agent for recruitment interview scheduling and candidate coordination.

Personality:
- Professional and organized
- Friendly and respectful
- Clear and efficient
- Helpful and responsive

Capabilities:
- Schedule interviews
- Coordinate candidate availability
- Confirm interview details
- Send interview reminders
- Manage rescheduling requests
- Provide interview instructions
- Verify candidate information
- Update recruitment records

Call Flow:
1. Greet the candidate
2. Confirm candidate identity
3. Discuss available interview slots
4. Select preferred schedule
5. Confirm interview details
6. Share interview instructions
7. Send confirmation message
8. Thank the candidate

Goals:
- Reduce HR scheduling workload
- Improve interview attendance
- Streamline recruitment processes
- Enhance candidate experience` },
      {
        name: "Hotel Reservation",
        prompt: `Create a voice AI agent for hotel booking and reservation management.

Personality:
- Professional and hospitable
- Friendly and welcoming
- Helpful and attentive
- Customer-focused

Capabilities:
- Check room availability
- Book hotel reservations
- Modify reservations
- Cancel bookings
- Explain hotel amenities
- Provide pricing information
- Confirm guest details
- Send booking confirmations

Call Flow:
1. Welcome the guest
2. Understand booking requirements
3. Check room availability
4. Present available options
5. Confirm reservation details
6. Explain hotel services
7. Send booking confirmation
8. Thank the guest

Goals:
- Increase reservation efficiency
- Improve guest satisfaction
- Reduce manual booking effort
- Enhance customer experience` }
    ],

    "Support": [
      {
        name: "E-Commerce Support",
        prompt: `Create a voice AI agent for e-commerce customer support and order assistance.

Personality:
- Friendly and empathetic
- Professional and patient
- Helpful and solution-oriented
- Customer-focused

Capabilities:
- Track customer orders
- Process return requests
- Handle refund inquiries
- Answer product questions
- Verify customer information
- Provide delivery updates
- Escalate complex issues
- Create support tickets

Call Flow:
1. Welcome the customer
2. Verify account or order details
3. Understand the issue
4. Provide order status or solution
5. Process returns or refunds if required
6. Confirm resolution
7. Escalate if necessary
8. Thank the customer

Goals:
- Improve customer satisfaction
- Reduce support workload
- Increase first-contact resolution
- Improve customer retention` },
      {
        name: "Technical Support",
        prompt: `Create a voice AI agent for technical troubleshooting and customer assistance.

Personality:
- Patient and professional
- Calm and reassuring
- Knowledgeable and helpful
- Solution-focused

Capabilities:
- Diagnose technical issues
- Guide troubleshooting steps
- Reset account credentials
- Create support tickets
- Escalate unresolved issues
- Provide product guidance
- Track issue status
- Collect diagnostic information

Call Flow:
1. Greet the customer
2. Verify customer identity
3. Understand the technical issue
4. Collect relevant details
5. Guide troubleshooting steps
6. Confirm resolution
7. Escalate if unresolved
8. Provide ticket reference

Goals:
- Improve first-call resolution
- Reduce support costs
- Increase customer satisfaction
- Resolve issues efficiently` },
      {
        name: "Banking Support",
        prompt: `Create a voice AI agent for banking customer service and account support.

Personality:
- Professional and trustworthy
- Secure and compliant
- Patient and courteous
- Helpful and responsive

Capabilities:
- Verify customer identity
- Provide account information
- Explain banking services
- Assist with card-related issues
- Handle transaction inquiries
- Guide customers through processes
- Create support requests
- Escalate sensitive matters

Call Flow:
1. Welcome the customer
2. Verify identity securely
3. Understand customer request
4. Retrieve relevant information
5. Provide assistance
6. Confirm issue resolution
7. Escalate if necessary
8. Thank the customer

Goals:
- Deliver secure customer service
- Improve response efficiency
- Increase customer trust
- Reduce branch workload` },
      {
        name: "Telecom Support",
        prompt: `Create a voice AI agent for telecom customer service and network support.

Personality:
- Professional and patient
- Friendly and helpful
- Clear and informative
- Customer-oriented

Capabilities:
- Diagnose network issues
- Explain mobile and internet plans
- Assist with service requests
- Handle billing inquiries
- Provide outage updates
- Process upgrade requests
- Create service tickets
- Escalate technical problems

Call Flow:
1. Welcome the customer
2. Verify account details
3. Understand service issue
4. Run basic diagnostics
5. Provide troubleshooting guidance
6. Explain available solutions
7. Escalate if required
8. Confirm next steps

Goals:
- Improve customer experience
- Reduce support response times
- Increase issue resolution rates
- Improve service satisfaction` },
      {
        name: "Billing Support",
        prompt: `Create a voice AI agent for billing assistance and payment-related inquiries.

Personality:
- Professional and respectful
- Patient and understanding
- Helpful and detail-oriented
- Customer-focused

Capabilities:
- Explain invoices and charges
- Verify payment status
- Resolve billing disputes
- Process payment inquiries
- Explain subscription fees
- Provide payment options
- Create billing tickets
- Escalate complex cases

Call Flow:
1. Welcome the customer
2. Verify account information
3. Understand billing concern
4. Review invoice details
5. Explain charges clearly
6. Offer available solutions
7. Escalate if necessary
8. Confirm issue resolution

Goals:
- Reduce billing-related tickets
- Improve customer satisfaction
- Increase payment clarity
- Resolve billing disputes efficiently` }
    ],

    "Negotiation": [
      {
        name: "Price Negotiation",
        prompt: `Create a voice AI agent for sales price negotiations and deal closure.

Personality:
- Professional and persuasive
- Confident and consultative
- Friendly and respectful
- Solution-oriented

Capabilities:
- Discuss pricing options
- Explain product value
- Handle pricing objections
- Offer approved discounts
- Compare plans and packages
- Identify customer concerns
- Capture negotiation outcomes
- Support deal closure

Call Flow:
1. Welcome the customer
2. Understand requirements
3. Discuss pricing concerns
4. Highlight product value
5. Present approved offers
6. Address objections
7. Confirm customer decision
8. Close or schedule follow-up

Goals:
- Increase sales conversions
- Improve deal closure rates
- Reduce lost opportunities
- Maximize revenue generation` },
      {
        name: "Subscription Retention",
        prompt: `Create a voice AI agent for customer retention and subscription renewal.

Personality:
- Friendly and empathetic
- Professional and persuasive
- Customer-focused
- Solution-driven

Capabilities:
- Identify cancellation reasons
- Offer retention plans
- Explain premium features
- Provide approved discounts
- Recommend alternative packages
- Capture customer feedback
- Escalate high-value customers
- Process retention requests

Call Flow:
1. Greet the customer
2. Understand cancellation reason
3. Explore customer concerns
4. Present retention offers
5. Explain plan benefits
6. Address objections
7. Confirm customer decision
8. Complete retention process

Goals:
- Reduce customer churn
- Increase subscription renewals
- Improve customer satisfaction
- Retain high-value customers` },
      {
        name: "Contract Renewal",
        prompt: `Create a voice AI agent for contract renewal management.

Personality:
- Professional and trustworthy
- Consultative and persuasive
- Friendly and proactive
- Customer-oriented

Capabilities:
- Contact existing customers
- Discuss contract benefits
- Review renewal terms
- Offer approved incentives
- Handle renewal objections
- Capture customer feedback
- Schedule follow-up discussions
- Escalate strategic accounts

Call Flow:
1. Welcome customer
2. Review existing contract
3. Discuss renewal options
4. Highlight benefits achieved
5. Address concerns
6. Present renewal incentives
7. Confirm renewal decision
8. Complete renewal process

Goals:
- Increase contract renewals
- Improve customer retention
- Reduce churn
- Strengthen customer relationships` },
      {
        name: "Vendor Negotiation",
        prompt: `Create a voice AI agent for vendor communication and procurement negotiations.

Personality:
- Professional and diplomatic
- Respectful and collaborative
- Detail-oriented
- Business-focused

Capabilities:
- Discuss pricing terms
- Review procurement requirements
- Capture vendor concerns
- Explain company expectations
- Negotiate delivery schedules
- Manage agreement discussions
- Record negotiation outcomes
- Escalate approval requests

Call Flow:
1. Introduce negotiation purpose
2. Review current agreement
3. Discuss pricing and terms
4. Understand vendor concerns
5. Explore possible adjustments
6. Summarize negotiated points
7. Confirm next steps
8. Schedule follow-up if required

Goals:
- Improve procurement efficiency
- Reduce operational costs
- Strengthen vendor relationships
- Achieve favorable contract terms` },
      {
        name: "Debt Settlement Negotiation",
        prompt: `Create a voice AI agent for debt settlement and repayment negotiations.

Personality:
- Professional and respectful
- Calm and empathetic
- Patient and understanding
- Compliance-focused

Capabilities:
- Verify customer identity
- Explain outstanding balances
- Discuss settlement options
- Offer approved repayment plans
- Capture customer preferences
- Schedule callbacks
- Record payment commitments
- Escalate special cases

Call Flow:
1. Verify customer identity
2. Explain account status
3. Discuss outstanding balance
4. Understand financial situation
5. Present settlement options
6. Agree on repayment plan
7. Confirm next steps
8. Thank customer and close call

Goals:
- Increase settlement success rates
- Improve repayment commitments
- Reduce overdue accounts
- Maintain positive customer relationships` }
    ],

    "Collections": [
      {
        name: "EMI Reminder",
        prompt: `Create a voice AI agent for EMI payment reminders and repayment assistance.

Personality:
- Professional and respectful
- Polite but firm
- Patient and understanding
- Compliance-focused

Capabilities:
- Verify customer identity
- Remind customers about upcoming or overdue EMI payments
- Explain outstanding balances
- Provide payment due dates
- Offer available payment methods
- Schedule callback requests
- Record payment commitments
- Escalate special cases

Call Flow:
1. Greet the customer professionally
2. Verify customer identity
3. Inform customer about EMI due status
4. Explain outstanding amount and due date
5. Discuss available payment options
6. Capture payment commitment
7. Schedule callback if necessary
8. Thank customer and close conversation

Goals:
- Improve EMI repayment rates
- Reduce overdue accounts
- Increase payment commitments
- Maintain positive customer relationships` },
      {
        name: "Credit Card Collection",
        prompt: `Create a voice AI agent for credit card payment recovery and collections.

Personality:
- Professional and courteous
- Calm and respectful
- Firm but empathetic
- Compliance-oriented

Capabilities:
- Verify cardholder identity
- Notify customers about overdue balances
- Explain minimum due amounts
- Discuss repayment options
- Offer approved payment plans
- Capture customer commitments
- Schedule follow-up reminders
- Escalate unresolved cases

Call Flow:
1. Verify customer identity
2. Explain overdue account status
3. Discuss outstanding balance
4. Understand payment challenges
5. Present repayment options
6. Record customer commitment
7. Schedule reminder or callback
8. Confirm next steps

Goals:
- Recover overdue credit card balances
- Increase promise-to-pay commitments
- Reduce delinquent accounts
- Improve recovery efficiency` },
      {
        name: "Loan Recovery",
        prompt: `Create a voice AI agent for loan recovery and repayment management.

Personality:
- Professional and respectful
- Empathetic and patient
- Firm and compliant
- Solution-focused

Capabilities:
- Verify borrower identity
- Explain overdue loan status
- Discuss repayment obligations
- Offer approved repayment arrangements
- Capture financial hardship information
- Schedule follow-up calls
- Record repayment commitments
- Escalate complex cases

Call Flow:
1. Verify borrower information
2. Explain account status
3. Discuss overdue payments
4. Understand customer situation
5. Present repayment solutions
6. Confirm payment commitment
7. Schedule follow-up communication
8. Summarize agreed next steps

Goals:
- Increase loan recovery rates
- Improve repayment commitments
- Reduce default rates
- Maintain customer relationships` },
      {
        name: "Rent Collection",
        prompt: `Create a voice AI agent for rental payment reminders and tenant communication.

Personality:
- Professional and courteous
- Respectful and understanding
- Calm and firm
- Service-oriented

Capabilities:
- Remind tenants about rent due dates
- Notify tenants of overdue rent
- Explain late payment penalties
- Provide payment instructions
- Record payment commitments
- Schedule reminders
- Handle tenant inquiries
- Escalate unresolved accounts

Call Flow:
1. Greet tenant professionally
2. Verify tenant details
3. Inform about rent status
4. Explain outstanding balance
5. Discuss payment arrangements
6. Capture commitment date
7. Schedule reminder if needed
8. Confirm next steps

Goals:
- Reduce late rent payments
- Improve collection efficiency
- Increase payment compliance
- Maintain positive tenant relationships` },
      {
        name: "Utility Bill Collection",
        prompt: `Create a voice AI agent for utility bill payment reminders and collections.

Personality:
- Professional and helpful
- Respectful and patient
- Clear and informative
- Compliance-focused

Capabilities:
- Notify customers of unpaid utility bills
- Explain outstanding balances
- Provide payment options
- Send payment reminders
- Record payment commitments
- Schedule callback requests
- Explain service interruption policies
- Escalate unresolved cases

Call Flow:
1. Verify customer information
2. Explain bill status
3. Inform customer of outstanding balance
4. Discuss payment methods
5. Capture payment commitment
6. Explain next steps
7. Schedule reminder if necessary
8. Thank customer and conclude call

Goals:
- Increase utility bill payment rates
- Reduce overdue accounts
- Improve customer communication
- Enhance collection efficiency` }
    ],

    "Moon Information": [
      {
        name: "Moon Phase Information",
        prompt: `Create a voice AI agent for providing moon phase information and lunar cycle education.

Personality:
- Educational and engaging
- Friendly and approachable
- Clear and informative
- Enthusiastic about astronomy

Capabilities:
- Explain current moon phases
- Describe lunar cycles
- Provide moon phase dates
- Answer astronomy questions
- Explain waxing and waning phases
- Share interesting moon facts
- Educate users about lunar events
- Provide beginner-friendly explanations

Call Flow:
1. Welcome the user
2. Understand astronomy question
3. Explain current moon phase
4. Describe lunar cycle details
5. Answer follow-up questions
6. Share educational insights
7. Provide additional resources
8. Thank user for their interest

Goals:
- Improve astronomy awareness
- Educate users about lunar science
- Increase user engagement
- Make astronomy easy to understand` },
      {
        name: "Full Moon Tracker",
        prompt: `Create a voice AI agent for providing full moon event information and observation guidance.

Personality:
- Friendly and informative
- Educational and engaging
- Enthusiastic about space science
- Easy to understand

Capabilities:
- Share upcoming full moon dates
- Explain full moon significance
- Provide viewing recommendations
- Explain different named full moons
- Share observation tips
- Answer moon-related questions
- Provide lunar calendar information
- Educate users about moon cycles

Call Flow:
1. Welcome the user
2. Identify requested information
3. Share full moon details
4. Explain significance of event
5. Provide viewing guidance
6. Answer questions
7. Suggest related astronomy topics
8. End interaction politely

Goals:
- Increase astronomy participation
- Improve public understanding of lunar events
- Encourage sky observation
- Enhance user engagement` },
      {
        name: "Lunar Eclipse Information",
        prompt: `Create a voice AI agent for lunar eclipse education and event guidance.

Personality:
- Educational and knowledgeable
- Friendly and engaging
- Patient and informative
- Science-focused

Capabilities:
- Explain lunar eclipses
- Describe eclipse types
- Share eclipse schedules
- Provide safe viewing guidance
- Explain eclipse science
- Answer astronomy questions
- Educate users about celestial events
- Share interesting eclipse facts

Call Flow:
1. Welcome the user
2. Understand eclipse inquiry
3. Explain eclipse event
4. Share timing and visibility details
5. Provide viewing recommendations
6. Answer follow-up questions
7. Share educational facts
8. Thank user for learning

Goals:
- Educate users about eclipses
- Promote scientific understanding
- Encourage astronomy learning
- Improve public engagement` },
      {
        name: "Moon Mission Information",
        prompt: `Create a voice AI agent for lunar exploration and moon mission education.

Personality:
- Educational and inspiring
- Knowledgeable and engaging
- Friendly and informative
- Passionate about space exploration

Capabilities:
- Explain Apollo missions
- Discuss Artemis missions
- Share lunar exploration history
- Explain moon landings
- Provide mission timelines
- Answer space-related questions
- Share astronaut achievements
- Educate users about future missions

Call Flow:
1. Welcome the user
2. Identify mission topic
3. Explain mission details
4. Share historical background
5. Discuss scientific achievements
6. Answer user questions
7. Highlight future exploration plans
8. Thank the user

Goals:
- Promote interest in space exploration
- Educate users about lunar missions
- Inspire curiosity about science
- Increase astronomy engagement` },
      {
        name: "Moon Facts for Kids",
        prompt: `Create a voice AI educational agent that teaches children about the Moon in a fun and engaging way.

Personality:
- Fun and energetic
- Friendly and encouraging
- Educational and interactive
- Child-friendly

Capabilities:
- Explain moon facts in simple language
- Answer children's astronomy questions
- Share fun moon trivia
- Teach basic space science
- Encourage curiosity
- Explain moon phases simply
- Tell educational stories
- Make learning interactive

Call Flow:
1. Welcome the child warmly
2. Ask what they want to learn
3. Share simple moon facts
4. Explain concepts using examples
5. Ask engaging questions
6. Share fun trivia
7. Encourage further learning
8. End with an interesting fact

Goals:
- Make astronomy fun for children
- Encourage scientific curiosity
- Improve learning engagement
- Build interest in space science` }
    ]
  };

  /*
    The template grid always shows something. selectedCategory stays nullable
    because handleCreate forwards it to /llm/generate-flow as an optional hint —
    "no category chosen" is meaningful there — but the UI falls back to the
    first category so the grid is never empty on first load.
  */
  const categoryNames = Object.keys(useCases);
  const activeCategory = selectedCategory ?? categoryNames[0];
  const activeTemplates =
    (useCases as Record<string, { name: string; prompt: string }[]>)[activeCategory] ?? [];

  return (
    <div className="omni-dashboard">
      {/* ════════════════════════════════════════════
          MAIN DASHBOARD CONTENT
         ════════════════════════════════════════════ */}

        {/* Page Header */}
        <div className="omni-page-header">
          <div className="omni-eyebrow">VOICE AI SETUP</div>
          <div className="omni-page-header-row">
            <h1>Describe it. {BRAND.name} builds the agent.</h1>
            {/*
              An honest count of the user's own live agents — design principle
              04. It is deliberately not a "12.1k calls handled" style figure:
              this system never shows invented crowd stats.
            */}
            {agents.length > 0 && (
              <span className="omni-live-count">
                <span className="omni-live-dot" />
                {agents.length} {agents.length === 1 ? 'agent' : 'agents'}
              </span>
            )}
          </div>
        </div>

        {/* Create Agent Card */}
        <div className="omni-create-card">
          {/*
            Naming the agent up front is optional — left blank, generation names
            it from the prompt (see handleCreate). It sits above the prompt
            rather than in a separate dialog so the whole act of creating an
            agent stays one surface.
          */}
          <input
            className="omni-create-title"
            placeholder="Agent name (optional — we'll generate one)"
            value={agentTitle}
            onChange={(e) => setAgentTitle(e.target.value)}
          />
          <textarea
            className="omni-create-textarea"
            placeholder="Describe your voice AI assistant's purpose, personality, and how it should handle"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          {enhanceError && (
            <p className="omni-enhance-error">⚠️ {enhanceError}</p>
          )}
          <div className="omni-create-actions">
            <button
              className="omni-btn omni-btn-secondary"
              onClick={handleEnhance}
              disabled={enhancing || !prompt.trim()}
            >
              {enhancing ? "Enhancing..." : "✨ Enhance Prompt"}
            </button>
            {/* A live reading of what will be sent — an instrument, so mono. */}
            <span className="omni-char-count sp-num">{prompt.length} chars</span>
            <button
              className="omni-btn omni-btn-primary"
              style={{ background: success ? "var(--lime)" : "" }}
              onClick={handleCreate}
              disabled={creating || success || !prompt.trim()}
            >
              {creating ? "Creating..." : success ? "✓ Created!" : "Create Voice AI Assistant"}
            </button>
          </div>
        </div>

        {/*
          Use-case templates.

          Moved out of the composer card and given its own section, matching the
          design: the card is the thing you type into, this is the shortcut past
          typing. Categories filter in place rather than the old drill-down —
          picking a category no longer hides the other five behind a back link.
        */}
        <div className="omni-templates">
          <div className="omni-templates-head">
            <div className="omni-templates-title">Or start from a use case</div>
            <div className="omni-cat-row">
              {Object.keys(useCases).map((category) => (
                <button
                  key={category}
                  className={`omni-cat${activeCategory === category ? ' is-active' : ''}`}
                  onClick={() => setSelectedCategory(category)}
                  aria-pressed={activeCategory === category}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>
          <div className="omni-template-grid">
            {activeTemplates.map((item) => {
              const meta = CATEGORY_META[activeCategory] ?? CATEGORY_FALLBACK;
              return (
                <button
                  key={item.name}
                  className="omni-template"
                  onClick={() => {
                    setPrompt(item.prompt);
                    setAgentTitle(item.name);
                  }}
                >
                  <div className="omni-template-head">
                    <span
                      className="omni-template-icon"
                      style={{ background: meta.bg, color: meta.fg }}
                      aria-hidden="true"
                    >
                      {meta.icon}
                    </span>
                    <div className="omni-template-name">{item.name}</div>
                  </div>
                  <div className="omni-template-desc">{templateDescription(item.prompt)}</div>
                  <div className="omni-template-cta">Use template →</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Assistants Section */}
        <div className="omni-assistants-section">
          <div className="omni-assistants-header">
            <h2>
              Your assistants
              {agents.length > 0 && <span className="omni-count sp-num"> · {agents.length}</span>}
            </h2>
            {agentsLoading && <p style={{ color: 'var(--tx-3)', fontSize: 13 }}>Loading your agents…</p>}
            {agentsError && (
              <div className="omni-load-error">
                <strong>Couldn’t load your agents:</strong> {agentsError}
                <div style={{ marginTop: 6, opacity: 0.85 }}>
                  Common causes: ① the backend isn’t running (start it with <code>npm run dev</code> in <code>backend/</code>) ·
                  ② database schema not migrated (<code>npx prisma migrate deploy</code> — now runs automatically with npm run dev) ·
                  ③ wrong <code>DATABASE_URL</code> in <code>backend/.env</code>. Admins can check Admin Panel → System Health.
                </div>
                <button onClick={() => fetchAgentsRef.current?.()} className="omni-retry-btn">
                  ↻ Retry
                </button>
              </div>
            )}
            <div className="omni-assistants-header-actions">
              <div className="omni-search-box">
                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
                <input
                  type="text"
                  placeholder="Filter assistants…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="omni-suggestions">
                <span>Suggested:</span>
                {['English', 'GPT-4', 'Moon', 'Support'].map(tag => (
                  <button key={tag} onClick={() => setSearchQuery(tag)}>
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="omni-assistants-grid">
            {/* Dynamic Agents only — no hardcoded demo card */}
            {agentsError ? null : agentsLoading ? null : filteredAgents.length === 0 ? (
              <div style={{ padding: '48px', textAlign: 'center', color: 'var(--tx-3)', background: 'var(--s1)', border: '1px dashed var(--line-2)', borderRadius: '14px' }}>
                <div style={{ fontSize: '40px', marginBottom: '12px' }}>🤖</div>
                <p style={{ fontSize: '15px', marginBottom: '6px', color: 'var(--tx-2)' }}>No assistants yet</p>
                <p style={{ fontSize: '13px' }}>Describe your use case above and click <strong style={{ color: 'var(--cyan-fg)' }}>Create Voice AI Assistant</strong></p>
              </div>
            ) : filteredAgents.map((assistant) => {
              const displayName = assistant.name
                .replace(/^Inbound Voice AI Agent:\s*/i, "")
                .replace(/^Create a voice AI agent for\s*/i, "");
              /*
                Initials for the avatar tile. Falls back to the first character
                so an agent named with a single word or a symbol still renders a
                tile rather than an empty square.
              */
              const initials = displayName
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((w) => w[0])
                .join('')
                .toUpperCase() || '·';
              return (
              <article key={assistant.id} className="omni-row">
                <span className="omni-row-avatar">{initials}</span>
                <div className="omni-row-body">
                  <div className="omni-row-title-line">
                    <div className="omni-row-name" title={assistant.name}>{displayName}</div>
                  </div>
                  {/*
                    Config summary in mono — these are instrument readings, not
                    prose, so they take the mono face and a single dense line
                    rather than the old six-cell grid.
                  */}
                  <div className="omni-row-meta">
                    <span>◷ {assistant.language || '—'}</span>
                    <span>◈ {assistant.llm || assistant.aiModel || '—'}</span>
                    <span>♪ {assistant.voice || '—'}</span>
                    <span>▤ {assistant.kbFiles ?? 0} KB</span>
                    <span>⌕ {assistant.search || 'Off'}</span>
                    <span>⇲ {assistant.integrations || 'None'}</span>
                  </div>
                </div>
                <div className="omni-row-actions">
                  <button
                    className="omni-btn omni-btn-danger"
                    title="Delete this assistant from your workspace"
                    onClick={(e) => handleDeleteAssistant(e, String(assistant.id))}
                  >
                    Delete
                  </button>
                  <button className="omni-btn omni-btn-primary" onClick={() => navigate(`/agent/${assistant.id}`)}>Edit</button>
                </div>
              </article>
              );
              })
              }
            </div>
          </div>

        {/* ════════════════════════════════════════════
          STYLES
         ════════════════════════════════════════════ */}
        <style>{`
        /* ── Base ── */
        .omni-dashboard {
          max-width: 1200px;
          margin: 0 auto;
          padding: 32px 24px;
          color: var(--tx);
        }

        /* ── Page Header ── */
        .omni-page-header {
          margin-bottom: 20px;
        }
        /* The recurring mono micro-label that opens every Spandan section. */
        .omni-eyebrow {
          font-family: var(--ff-m);
          font-size: 11px;
          letter-spacing: 2px;
          color: var(--cyan);
        }
        .omni-page-header-row {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
        }
        .omni-page-header h1 {
          font-family: var(--ff-d);
          font-size: clamp(24px, 3vw, 34px);
          font-weight: 700;
          letter-spacing: -0.02em;
          margin: 8px 0 0;
          color: var(--tx);
        }
        .omni-live-count {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-family: var(--ff-m);
          font-size: 11.5px;
          color: var(--tx-3);
          white-space: nowrap;
        }
        .omni-live-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--lime);
          box-shadow: 0 0 8px var(--lime);
          animation: omni-blink 2s infinite;
        }
        @keyframes omni-blink { 0%, 100% { opacity: 1 } 50% { opacity: .3 } }
        @media (prefers-reduced-motion: reduce) {
          .omni-live-dot { animation: none }
        }

        /* ── Create Card ── */
        /*
          The gradient runs from the card surface down into the page canvas, so
          the composer reads as the one raised, "live" object on the screen —
          the accent-card treatment from the design system, used once per view.
        */
        .omni-create-card {
          background: linear-gradient(180deg, var(--s1), var(--bg-2));
          border: 1px solid var(--line-2);
          border-radius: 18px;
          padding: 20px;
          margin-bottom: 32px;
        }
        .omni-create-title {
          width: 100%;
          background: transparent;
          border: none;
          outline: none;
          color: var(--tx);
          font-family: var(--ff-d);
          font-weight: 700;
          font-size: 18px;
          margin-bottom: 10px;
          box-sizing: border-box;
        }
        .omni-create-title::placeholder { color: var(--tx-3); }
        .omni-create-textarea {
          width: 100%;
          min-height: 140px;
          background: var(--s2);
          border: 1px solid var(--line-2);
          border-radius: 12px;
          padding: 14px;
          color: var(--tx);
          font-size: 14px;
          line-height: 1.55;
          resize: vertical;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
          margin-bottom: 20px;
          box-sizing: border-box;
        }
        .omni-create-textarea::placeholder {
          color: var(--tx-3);
        }
        .omni-create-textarea:focus {
          border-color: var(--cyan);
          box-shadow: 0 0 0 3px rgba(14, 179, 158, 0.14);
        }

        .omni-enhance-error {
          color: var(--err);
          font-size: 12px;
          margin: 0 0 8px;
        }
        .omni-create-actions {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .omni-char-count {
          font-size: 11.5px;
          color: var(--tx-3);
        }
        /* Pushes the primary action to the trailing edge of the composer. */
        .omni-create-actions .omni-btn-primary { margin-left: auto; }

        /* ── Use-case templates ── */
        .omni-templates { margin-bottom: 32px; }
        .omni-templates-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 12px;
          flex-wrap: wrap;
        }
        .omni-templates-title {
          font-family: var(--ff-d);
          font-weight: 700;
          font-size: 16px;
          color: var(--tx);
        }
        .omni-cat-row {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }
        .omni-cat {
          background: transparent;
          border: 1px solid var(--line);
          border-radius: 100px;
          padding: 6px 13px;
          font-size: 12.5px;
          color: var(--tx-3);
          cursor: pointer;
          transition: color .15s, border-color .15s, background .15s;
          white-space: nowrap;
        }
        .omni-cat:hover {
          color: var(--tx);
          border-color: var(--line-2);
        }
        .omni-cat.is-active {
          background: rgba(14,179,158,.12);
          border-color: rgba(14,179,158,.4);
          color: var(--cyan-fg);
          font-weight: 600;
        }

        .omni-template-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
        }
        .omni-template {
          text-align: left;
          background: var(--s1);
          border: 1px solid var(--line);
          border-radius: 13px;
          padding: 15px;
          cursor: pointer;
          transition: border-color .15s, background .15s;
          display: flex;
          flex-direction: column;
        }
        .omni-template:hover {
          border-color: var(--line-2);
          background: var(--s2);
        }
        .omni-template-head {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .omni-template-icon {
          width: 32px;
          height: 32px;
          border-radius: 9px;
          display: grid;
          place-items: center;
          font-size: 14px;
          flex-shrink: 0;
        }
        .omni-template-name {
          font-family: var(--ff-d);
          font-weight: 600;
          font-size: 14px;
          color: var(--tx);
        }
        .omni-template-desc {
          font-size: 12.5px;
          color: var(--tx-2);
          line-height: 1.5;
          margin-top: 10px;
          /* Descriptions are derived from prompt copy of varying length; clamp
             so a long one cannot make its card taller than its row-mates. */
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .omni-template-cta {
          font-family: var(--ff-m);
          font-size: 11px;
          color: var(--cyan-fg);
          margin-top: 10px;
        }
        @media (max-width: 1000px) {
          .omni-template-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 640px) {
          .omni-template-grid { grid-template-columns: 1fr; }
        }

        /* ── Buttons ── */
        .omni-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 10px 20px;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          border: none;
          transition: all 0.2s;
          white-space: nowrap;
        }
        .omni-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .omni-btn-primary {
          background: var(--cyan);
          /*
            Ink ON the brand fill, so it stays a literal. --cyan is the same
            value in both themes precisely because its foreground is fixed;
            a token here would go light in light mode and put pale text on a
            teal button. #04211d is the design system's on-cyan ink.
          */
          color: #04211d;
        }
        .omni-btn-primary:hover:not(:disabled) {
          background: var(--teal-hover);
        }
        .omni-btn-secondary {
          background: var(--s2);
          color: var(--tx);
          border: 1px solid var(--line-2);
        }
        .omni-btn-secondary:hover:not(:disabled) {
          border-color: var(--cyan-fg);
          color: var(--cyan-fg);
        }
        .omni-btn-danger {
          background: transparent;
          color: var(--err);
          border: 1px solid rgba(248,113,113,0.45);
        }
        .omni-btn-danger:hover:not(:disabled) {
          background: rgba(248,113,113,0.12);
          border-color: var(--err);
        }

        /* ── Assistants Section ── */
        .omni-assistants-section {
          margin-top: 8px;
        }
        .omni-assistants-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
          flex-wrap: wrap;
          gap: 12px;
        }
        .omni-assistants-header h2 {
          font-family: var(--ff-d);
          font-size: 16px;
          font-weight: 700;
          color: var(--tx);
          margin: 0;
        }
        /* The count is a reading, not part of the title — mono and receded. */
        .omni-count {
          font-size: 13px;
          color: var(--tx-3);
          font-weight: 400;
        }
        .omni-assistants-header-actions {
          display: flex;
          align-items: center;
          gap: 16px;
          flex-wrap: wrap;
        }
        .omni-search-box {
          display: flex;
          align-items: center;
          gap: 8px;
          background: var(--s1);
          border: 1px solid var(--line-2);
          border-radius: 9px;
          padding: 8px 11px;
          min-width: 220px;
          transition: border-color .2s, box-shadow .2s;
        }
        .omni-search-box:focus-within {
          border-color: var(--cyan);
          box-shadow: 0 0 0 3px rgba(14, 179, 158, 0.14);
        }
        .omni-search-box svg {
          color: var(--tx-3);
          flex-shrink: 0;
        }
        .omni-search-box input {
          background: transparent;
          border: none;
          outline: none;
          color: var(--tx);
          font-size: 13px;
          width: 100%;
        }
        .omni-search-box input::placeholder {
          color: var(--tx-3);
        }

        /* ── Agents failed to load ── */
        .omni-load-error {
          background: rgba(248,113,113,0.08);
          border: 1px solid rgba(248,113,113,0.35);
          color: var(--err);
          border-radius: 10px;
          padding: 12px 16px;
          font-size: 13px;
          margin: 10px 0;
          line-height: 1.6;
        }
        .omni-load-error code {
          font-family: var(--ff-m);
          font-size: 12px;
        }
        .omni-retry-btn {
          margin-top: 10px;
          background: transparent;
          border: 1px solid rgba(248,113,113,0.5);
          color: var(--err);
          border-radius: 8px;
          padding: 4px 14px;
          cursor: pointer;
          font-size: 12.5px;
        }
        .omni-retry-btn:hover {
          background: rgba(248,113,113,0.10);
        }
        .omni-suggestions {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          color: var(--tx-3);
        }
        .omni-suggestions button {
          background: var(--s1);
          border: 1px solid var(--line);
          border-radius: 6px;
          padding: 4px 10px;
          font-size: 12px;
          color: var(--tx-2);
          cursor: pointer;
          transition: all 0.2s;
        }
        .omni-suggestions button:hover {
          border-color: var(--cyan-fg);
          color: var(--cyan-fg);
        }

        /* ── Cards Grid ── */
        /*
          A vertical list, not a card grid. Agents are scanned by name and
          compared on their config, and a single-column list keeps the name,
          the mono config line and the actions on one baseline — the 340px grid
          cells wrapped the config into six cramped cells and pushed the Edit
          button to a different height in every card.
        */
        .omni-assistants-grid {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .omni-row {
          background: var(--s1);
          border: 1px solid var(--line);
          border-radius: 14px;
          padding: 16px 18px;
          display: flex;
          align-items: center;
          gap: 16px;
          transition: border-color 0.15s;
        }
        .omni-row:hover {
          border-color: var(--line-2);
        }
        .omni-row-avatar {
          width: 44px;
          height: 44px;
          border-radius: 11px;
          background: linear-gradient(135deg, var(--cyan), var(--violet));
          display: grid;
          place-items: center;
          font-family: var(--ff-d);
          font-weight: 700;
          font-size: 15px;
          color: #04211d;
          flex-shrink: 0;
        }
        .omni-row-body { min-width: 0; flex: 1; }
        .omni-row-title-line {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .omni-row-name {
          font-family: var(--ff-d);
          font-weight: 600;
          font-size: 15px;
          color: var(--tx);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .omni-row-meta {
          display: flex;
          gap: 14px;
          margin-top: 6px;
          font-family: var(--ff-m);
          font-size: 11.5px;
          color: var(--tx-3);
          flex-wrap: wrap;
        }
        .omni-row-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }
        @media (max-width: 700px) {
          .omni-row { flex-wrap: wrap; }
          .omni-row-actions { width: 100%; justify-content: flex-end; }
        }

        /* ════════════════════════════════════════ */
        /* RESPONSIVE: TABLET & MOBILE              */
        /* ════════════════════════════════════════ */

        @media (max-width: 768px) {
          .omni-dashboard {
            padding: 16px;
          }
          .omni-page-header h1 {
            font-size: 22px;
          }
          /* Create card - teal border on mobile */
          .omni-create-card {
            padding: 18px;
            border-radius: 12px;
            border: 1px solid var(--cyan-fg);
            background: var(--bg-secondary);
          }
          .omni-create-card-header h3 {
            color: var(--cyan-fg);
            font-size: 15px;
          }
          .omni-create-textarea {
            min-height: 120px;
            font-size: 14px;
            background: var(--s2);
            border-color: var(--line-2);
          }
          .omni-create-actions {
            flex-direction: column;
            align-items: stretch;
            width: 100%;
          }
          .omni-create-actions .omni-btn {
            width: 100%;
          }
          /* Hide enhance button on mobile */
          .omni-create-actions .omni-btn-secondary {
            display: none;
          }
          .omni-create-actions .omni-btn-primary {
            width: 100%;
            padding: 14px 20px;
            font-size: 14px;
            /* The auto margin only makes sense on the horizontal row. */
            margin-left: 0;
          }
          /* Char count reads as a caption above the button once stacked. */
          .omni-char-count {
            order: -1;
            text-align: right;
          }
          /* Assistants section */
          .omni-assistants-section {
            margin-top: 24px;
          }
          .omni-assistants-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 12px;
          }
          .omni-assistants-header h2 {
            font-size: 18px;
          }
          .omni-assistants-header-actions {
            width: 100%;
          }
          .omni-search-box {
            width: 100%;
            min-width: unset;
          }
          .omni-suggestions {
            flex-wrap: wrap;
            gap: 6px;
          }
          /* The list is already single-column; just tighten it on small screens. */
          .omni-assistants-grid {
            gap: 8px;
          }
          .omni-row {
            padding: 14px;
          }
        }

        @media (max-width: 480px) {
          .omni-dashboard {
            padding: 12px;
          }
          .omni-create-card {
            padding: 14px;
          }
          /* Drop the avatar so the name and its config line keep full width. */
          .omni-row-avatar {
            display: none;
          }
          .omni-row-meta {
            gap: 8px;
          }
          .omni-suggestions span {
            display: none;
          }
        }
      `}</style>
    </div>
      );
}

