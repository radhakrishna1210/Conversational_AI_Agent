import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AgentConfig, createAgent, loadAgents, getDefaultFlowItems, getDefaultWelcomeMessage } from '../lib/agentStore';
import { whapi } from '../lib/whapi';


export default function Dashboard() {
  const [prompt, setPrompt] = useState('');
  const [agentTitle, setAgentTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleClickOutside = () => {
      setOpenDropdownId(null);
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const handleMenuClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setOpenDropdownId(openDropdownId === id ? null : id);
  };

  const handleCopyAssistant = async (e: React.MouseEvent, assistant: AgentConfig) => {
    e.stopPropagation();
    setOpenDropdownId(null);
    const newName = `${assistant.name} (Copy)`;
    try {
      const newAgentDetails = {
        name: newName,
        welcomeMessage: assistant.welcomeMessage || '',
        flowItems: assistant.flowItems || [],
        aiModel: assistant.aiModel || 'GPT-4.1-Mini',
        voice: assistant.voice || 'Google - Aoede (female)',
      };
      const newAgent = await whapi.post<AgentConfig>('/agents', newAgentDetails);
      setAgents(prev => [newAgent, ...prev]);
    } catch (err) {
      console.error('Failed to copy agent on backend', err);
      // Fallback
      const localId = String(Date.now());
      const nowStr = new Date().toISOString();
      const localAgent: AgentConfig = {
        ...assistant,
        id: localId,
        name: newName,
        createdAt: nowStr,
        updatedAt: nowStr
      };
      const agentsList = loadAgents();
      agentsList.unshift(localAgent);
      localStorage.setItem('voice_ai_agents_v1', JSON.stringify(agentsList));
      setAgents(prev => [localAgent, ...prev]);
    }
  };

  const handleDeleteAssistant = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setOpenDropdownId(null);
    if (!window.confirm('Are you sure you want to delete this assistant?')) return;
    try {
      await whapi.del(`/agents/${id}`);
      setAgents(prev => prev.filter(a => a.id !== id));
    } catch (err) {
      console.error('Failed to delete on backend', err);
      // Fallback local
      const agentsList = loadAgents().filter(a => a.id !== id);
      localStorage.setItem('voice_ai_agents_v1', JSON.stringify(agentsList));
      setAgents(prev => prev.filter(a => a.id !== id));
    }
  };

  useEffect(() => {
    const fetchAgents = async () => {
      try {
        const backendAgents = await whapi.get<AgentConfig[]>('/agents');
        if (Array.isArray(backendAgents)) {
          setAgents(backendAgents);
        } else {
          setAgents(loadAgents());
        }
      } catch (err) {
        console.error('Failed to fetch agents from backend', err);
        setAgents(loadAgents());
      }
    };
    fetchAgents();
  }, []);

  const [enhanceError, setEnhanceError] = useState('');

  const extractAgentTitle = (text: string) => {
    let title = text
      .replace(/^create\s+(a\s+)?voice\s+ai\s+agent\s+for\s+/i, '')
      .replace(/^create\s+(an?\s+)?ai\s+agent\s+for\s+/i, '')
      .replace(/^create\s+(a\s+)?voice\s+ai\s+assistant\s+for\s+/i, '')
      .replace(/^create\s+/i, '')
      .trim();

    title = title
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');

    if (!title.toLowerCase().includes('agent')) {
      title += ' Agent';
    }

    return title;
  };

  const generateAgentName = (text: string) => {
    let title = text
      .replace(/^create\s+(a\s+)?voice\s+ai\s+agent\s+for\s+/i, '')
      .replace(/^create\s+(an?\s+)?ai\s+agent\s+for\s+/i, '')
      .replace(/^create\s+(a\s+)?voice\s+ai\s+assistant\s+for\s+/i, '')
      .replace(/^create\s+/i, '')
      .trim();

    title = title
      .replace(/\bassistance\b/gi, '')
      .replace(/\bassistant\b/gi, '')
      .replace(/\bagent\b/gi, '')
      .trim();

    title = title
      .split(' ')
      .filter(Boolean)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');

    return title ? `${title} Agent` : 'Voice AI Agent';
  };

  const handleEnhance = async () => {
    if (!prompt.trim()) return;
    setEnhanceError('');
    try {
      setEnhancing(true);
      const response = await fetch('/api/v1/llm/enhance-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      if (!response.ok) throw new Error('Enhance failed — please try again');

      const data = await response.json();
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
    // Attempt to generate flow dynamically from LLM backend (public endpoint — no auth needed)
    try {
      const genRes = await fetch('/api/v1/llm/generate-flow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (genRes.ok) {
        const generated = await genRes.json();
        if (generated && generated.welcomeMessage && Array.isArray(generated.flowItems)) {
          welcomeMsg = generated.welcomeMessage;
          defaultFlow = generated.flowItems;
        }
      } else {
        console.warn('generate-flow returned non-OK status:', genRes.status);
      }
    } catch (genErr) {
      console.warn('Failed to dynamically generate conversational flow, falling back to templates', genErr);
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
        name,
        welcomeMessage: welcomeMsg,
        flowItems: defaultFlow,
        aiModel: 'GPT-4.1-Mini',
        voice: 'Google - Aoede (female)',
      });

      setAgents(prev => [newAgent, ...prev]);
      setPrompt('');
      setAgentTitle('');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (err) {
      console.error('Failed to create agent on backend', err);
      // Fallback to local storage using the generated settings
      const localId = String(Date.now());
      const nowStr = new Date().toISOString();
      const localAgent: AgentConfig = {
        id: localId,
        name,
        language: 'English (India)',
        llm: 'GPT-4.1-Mini',
        voice: 'Google - Aoede (female)',
        kbFiles: 0,
        search: 'Off',
        postCall: 'None',
        integrations: 'None',
        welcomeMessage: welcomeMsg,
        selectedLanguages: ['English (Indian)'],
        flowItems: defaultFlow,
        maxDuration: 30,
        silenceTimeout: 5,
        dynamicEnabled: true,
        interruptibleEnabled: true,
        aiModel: 'GPT-4.1-Mini',
        transcription: 'Azure',
        createdAt: nowStr,
        updatedAt: nowStr
      };

      const agentsList = loadAgents();
      agentsList.unshift(localAgent);
      localStorage.setItem('voice_ai_agents_v1', JSON.stringify(agentsList));

      setAgents(prev => [localAgent, ...prev]);
      setPrompt('');
      setAgentTitle('');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } finally {
      setCreating(false);
    }
  };


  const setTemplate = (template: string) => setPrompt(template);

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
  return (
    <>
    <div className="omni-dashboard">
      {/* ════════════════════════════════════════════
          MAIN DASHBOARD CONTENT
         ════════════════════════════════════════════ */}

        {/* Page Header */}
        <div className="omni-page-header">
          <h1>Voice AI Assistants</h1>
          <p>Create and manage your voice AI assistants</p>
        </div>

        {/* Create Agent Card */}
        <div className="omni-create-card">
          <div className="omni-create-card-header">
            <h3>Create a new voice AI assistant</h3>
            <p>Describe the type of voice AI assistant you want to create</p>
          </div>
          <textarea
            className="omni-create-textarea"
            placeholder="Describe your voice AI assistant's purpose, personality, and how it should handle"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <div className="omni-create-footer">
            <div className="omni-templates-section">
              <p className="omni-templates-label">Choose from Use Case Categories:</p>
              <div className="omni-use-case-chips">
                {!selectedCategory &&
                  Object.keys(useCases).map((category) => (
                    <button
                      key={category}
                      className="omni-chip"
                      onClick={() => setSelectedCategory(category)}
                    >
                      {category}
                    </button>
                  ))
                }
              </div>
              {selectedCategory && (
                <div style={{ marginTop: "16px" }}>
                  <h4
                    onClick={() => setSelectedCategory(null)}
                    className="omni-category-back"
                  >
                    ← {selectedCategory}
                  </h4>
                  <div className="omni-use-case-chips">
                    {(useCases as Record<string, { name: string; prompt: string }[]>)[selectedCategory].map((item) => (
                      <button
                        key={item.name}
                        className="omni-chip"
                        onClick={() => {
                          setPrompt(item.prompt);
                          setAgentTitle(item.name);
                        }}
                      >
                        {item.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="omni-create-actions">
              {enhanceError && (
                <p style={{ color: '#f87171', fontSize: '12px', margin: '0 0 8px' }}>⚠️ {enhanceError}</p>
              )}
              <button
                className="omni-btn omni-btn-secondary"
                onClick={handleEnhance}
                disabled={enhancing || !prompt.trim()}
              >
                {enhancing ? "Enhancing..." : "✨ Enhance Prompt"}
              </button>
              <button
                className="omni-btn omni-btn-primary"
                style={{ background: success ? "#10b981" : "" }}
                onClick={handleCreate}
                disabled={creating || success || !prompt.trim()}
              >
                {creating ? "Creating..." : success ? "✓ Created!" : "Create Voice AI Assistant"}
              </button>
            </div>
          </div>
        </div>

        {/* Assistants Section */}
        <div className="omni-assistants-section">
          <div className="omni-assistants-header">
            <h2>My Voice AI Assistants</h2>
            <div className="omni-assistants-header-actions">
              <div className="omni-search-box">
                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
                <input
                  type="text"
                  placeholder="Search assistants..."
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
            {filteredAgents.length === 0 ? (
              <div style={{ gridColumn: '1/-1', padding: '48px', textAlign: 'center', color: '#64748b', background: '#1e293b', border: '1px dashed #334155', borderRadius: '14px' }}>
                <div style={{ fontSize: '40px', marginBottom: '12px' }}>🤖</div>
                <p style={{ fontSize: '15px', marginBottom: '6px', color: '#94a3b8' }}>No assistants yet</p>
                <p style={{ fontSize: '13px' }}>Describe your use case above and click <strong style={{ color: '#14b8a6' }}>Create Voice AI Assistant</strong></p>
              </div>
            ) : filteredAgents.map((assistant) => (
              <article key={assistant.id} className="omni-card">
                <div className="omni-card-head">
                  <div>
                    <h3>{assistant.name
                      .replace(/^Inbound Voice AI Agent:\s*/i, "")
                      .replace(/^Create a voice AI agent for\s*/i, "")
                      .substring(0, 40)}</h3>
                    <p>{assistant.language}</p>
                  </div>
                  <div style={{ position: 'relative' }}>
                    <button
                      className="assistant-menu"
                      aria-label="Assistant actions"
                      onClick={(e) => handleMenuClick(e, assistant.id)}
                    >
                      ⋮
                    </button>
                    {openDropdownId === assistant.id && (
                      <div className="assistant-menu-dropdown">
                        <button onClick={(e) => handleCopyAssistant(e, assistant)}>
                          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                          </svg>
                          Copy Assistant
                        </button>
                        <button className="delete-btn" onClick={(e) => handleDeleteAssistant(e, assistant.id)}>
                          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            <line x1="10" y1="11" x2="10" y2="17"></line>
                            <line x1="14" y1="11" x2="14" y2="17"></line>
                          </svg>
                          Delete Assistant
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="omni-card-meta">
                  <div><span>LLM:</span> <strong>{assistant.llm}</strong></div>
                  <div><span>Voice:</span> <strong>{assistant.voice}</strong></div>
                  <div><span>KB Files:</span> <strong>{assistant.kbFiles}</strong></div>
                  <div><span>Search:</span> <strong>{assistant.search}</strong></div>
                  <div><span>Post-call:</span> <strong>{assistant.postCall}</strong></div>
                  <div><span>Integrations:</span> <strong>{assistant.integrations}</strong></div>
                </div>
                <div className="omni-card-footer">
                  <span className="omni-card-id">ID: {assistant.id}</span>
                  <button className="omni-btn omni-btn-primary" onClick={() => navigate(`/agent/${assistant.id}`)}>Edit Agent</button>
                </div>
              </article>
            ))
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
          color: #e2e8f0;
        }

        /* ── Page Header ── */
        .omni-page-header {
          margin-bottom: 32px;
        }
        .omni-page-header h1 {
          font-size: 28px;
          font-weight: 800;
          letter-spacing: -0.5px;
          margin-bottom: 6px;
          color: #f8fafc;
        }
        .omni-page-header p {
          color: #94a3b8;
          font-size: 14px;
          margin: 0;
        }

        /* ── Create Card ── */
        .omni-create-card {
          background: #1e293b;
          border: 1px solid #334155;
          border-radius: 16px;
          padding: 28px;
          margin-bottom: 32px;
        }
        .omni-create-card-header h3 {
          font-size: 16px;
          font-weight: 600;
          color: #f8fafc;
          margin: 0 0 6px;
        }
        .omni-create-card-header p {
          font-size: 13px;
          color: #94a3b8;
          margin: 0 0 18px;
        }
        .omni-create-textarea {
          width: 100%;
          min-height: 140px;
          background: #0f172a;
          border: 1px solid #334155;
          border-radius: 12px;
          padding: 16px;
          color: #e2e8f0;
          font-size: 14px;
          line-height: 1.6;
          resize: vertical;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
          margin-bottom: 20px;
          box-sizing: border-box;
        }
        .omni-create-textarea::placeholder {
          color: #64748b;
        }
        .omni-create-textarea:focus {
          border-color: #14b8a6;
          box-shadow: 0 0 0 3px rgba(20, 184, 166, 0.12);
        }

        .omni-create-footer {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          flex-wrap: wrap;
          gap: 20px;
        }

        .omni-templates-section {
          flex: 1;
          min-width: 280px;
        }
        .omni-templates-label {
          font-size: 12px;
          color: #64748b;
          margin-bottom: 10px;
        }
        .omni-use-case-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .omni-chip {
          background: #0f172a;
          border: 1px solid #334155;
          border-radius: 20px;
          padding: 6px 14px;
          font-size: 12px;
          color: #94a3b8;
          cursor: pointer;
          transition: all 0.2s;
          white-space: nowrap;
        }
        .omni-chip:hover {
          border-color: #14b8a6;
          color: #14b8a6;
          background: rgba(20, 184, 166, 0.08);
        }
        .omni-category-back {
          cursor: pointer;
          color: #14b8a6;
          margin-bottom: 12px;
          font-size: 14px;
          font-weight: 500;
        }

        .omni-create-actions {
          display: flex;
          gap: 10px;
          flex-shrink: 0;
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
          background: #14b8a6;
          color: #0f172a;
        }
        .omni-btn-primary:hover:not(:disabled) {
          background: #0d9488;
        }
        .omni-btn-secondary {
          background: #1e293b;
          color: #e2e8f0;
          border: 1px solid #334155;
        }
        .omni-btn-secondary:hover:not(:disabled) {
          border-color: #14b8a6;
          color: #14b8a6;
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
          font-size: 18px;
          font-weight: 700;
          color: #f8fafc;
          margin: 0;
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
          background: #1e293b;
          border: 1px solid #334155;
          border-radius: 10px;
          padding: 8px 14px;
          min-width: 220px;
        }
        .omni-search-box svg {
          color: #64748b;
          flex-shrink: 0;
        }
        .omni-search-box input {
          background: transparent;
          border: none;
          outline: none;
          color: #e2e8f0;
          font-size: 13px;
          width: 100%;
        }
        .omni-search-box input::placeholder {
          color: #64748b;
        }
        .omni-suggestions {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          color: #64748b;
        }
        .omni-suggestions button {
          background: #1e293b;
          border: 1px solid #334155;
          border-radius: 6px;
          padding: 4px 10px;
          font-size: 12px;
          color: #94a3b8;
          cursor: pointer;
          transition: all 0.2s;
        }
        .omni-suggestions button:hover {
          border-color: #14b8a6;
          color: #14b8a6;
        }

        /* ── Cards Grid ── */
        .omni-assistants-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
          gap: 20px;
        }
        .omni-card {
          background: #1e293b;
          border: 1px solid #334155;
          border-radius: 14px;
          padding: 20px;
          display: flex;
          flex-direction: column;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .omni-card:hover {
          border-color: #475569;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
        }
        .omni-card-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 16px;
        }
        .omni-card-head h3 {
          font-size: 14px;
          font-weight: 600;
          color: #f8fafc;
          margin: 0 0 4px;
          line-height: 1.4;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .omni-card-head p {
          font-size: 12px;
          color: #64748b;
          margin: 0;
        }
        .omni-card-menu {
          background: transparent;
          border: none;
          color: #64748b;
          font-size: 18px;
          cursor: pointer;
          padding: 4px;
          border-radius: 6px;
          line-height: 1;
        }
        .omni-card-menu:hover {
          background: #334155;
          color: #e2e8f0;
        }
        .omni-card-meta {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px 16px;
          margin-bottom: 18px;
          flex: 1;
        }
        .omni-card-meta div {
          font-size: 12px;
          color: #94a3b8;
        }
        .omni-card-meta span {
          color: #64748b;
        }
        .omni-card-meta strong {
          color: #e2e8f0;
          font-weight: 500;
        }
        .omni-card-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-top: 14px;
          border-top: 1px solid #334155;
        }
        .omni-card-id {
          font-size: 11px;
          color: #475569;
          font-family: monospace;
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
            border: 1px solid #14b8a6;
            background: #0f172a;
          }
          .omni-create-card-header h3 {
            color: #14b8a6;
            font-size: 15px;
          }
          .omni-create-textarea {
            min-height: 120px;
            font-size: 14px;
            background: #1e293b;
            border-color: #334155;
          }
          .omni-create-footer {
            flex-direction: column;
            align-items: stretch;
            gap: 16px;
          }
          .omni-create-actions {
            flex-direction: column;
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
          }
          /* Use case chips */
          .omni-use-case-chips {
            gap: 8px;
          }
          .omni-chip {
            font-size: 12px;
            padding: 8px 14px;
            background: #1e293b;
            border-color: #334155;
            color: #e2e8f0;
            border-radius: 8px;
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
          /* Assistants grid - single column on mobile */
          .omni-assistants-grid {
            grid-template-columns: 1fr;
            gap: 14px;
          }
          .omni-card {
            padding: 16px;
            background: #1e293b;
            border: 1px solid #334155;
          }
          .omni-card-head h3 {
            font-size: 14px;
          }
          .omni-card-meta {
            grid-template-columns: 1fr 1fr;
            gap: 8px 12px;
            font-size: 12px;
          }
          .omni-card-footer {
            flex-direction: column;
            gap: 10px;
            align-items: stretch;
          }
          .omni-card-footer .omni-btn {
            width: 100%;
          }
        }

        @media (max-width: 480px) {
          .omni-dashboard {
            padding: 12px;
          }
          .omni-create-card {
            padding: 14px;
          }
          .omni-card-meta {
            grid-template-columns: 1fr;
          }
          .omni-suggestions span {
  display: none;
}
}
`}</style>
    </div>
    </>
);
}