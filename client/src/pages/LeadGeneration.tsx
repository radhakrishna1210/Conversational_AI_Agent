import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  BarChart3,
  Bell,
  Calendar,
  ChevronDown,
  ChevronRight,
  PhoneCall,
  ShieldCheck,
  Sparkles,
  Target,
  type LucideIcon,
} from 'lucide-react';
import Navbar from '../components/Navbar';

const heroPoints = [
  {
    title: 'Outbound Cold Calling',
    description: 'Make hundreds of prospecting calls daily with natural conversations',
  },
  {
    title: 'Inbound Lead Qualification',
    description: 'Qualify prospects based on your criteria and route hot leads instantly',
  },
  {
    title: 'Meeting Scheduling',
    description: 'Book appointments directly into your calendar automatically',
  },
];

const leadTemplates: Array<{ label: string; icon: LucideIcon }> = [
  { label: 'Lead Follow-Up Agent', icon: PhoneCall },
  { label: 'Cold Call Insurance Prospects', icon: ShieldCheck },
  { label: 'Abandoned Cart Recovery', icon: Bell },
  { label: 'Event Invitation Calls', icon: Calendar },
];

const featureCards = [
  {
    icon: PhoneCall,
    title: 'Intelligent Cold Calling',
    description:
      'Your assistant makes personalized cold calls with natural conversation flow, handles objections professionally, and adapts to prospect responses in real time.',
    tags: ['Natural conversations', 'Objection handling', 'Personalized pitches', 'Adaptive responses'],
  },
  {
    icon: Target,
    title: 'Lead Qualification',
    description:
      'Configure your assistant to qualify prospects based on criteria you define - such as Budget, Authority, Need, and Timeline (BANT) - to identify high-value opportunities for your sales team.',
    tags: ['Custom qualification', 'Quality scoring', 'Priority routing', 'Time savings'],
  },
  {
    icon: Calendar,
    title: 'Meeting Scheduling',
    description:
      'Book meetings into your team calendar automatically once a prospect is qualified, removing back-and-forth scheduling from your sales process.',
    tags: ['Calendar booking', 'Instant handoff', 'Reminder follow-up', 'Reduced friction'],
  },
  {
    icon: BarChart3,
    title: 'CRM Integration',
    description:
      'Send every conversation, qualification result, and next step to your CRM so your sales team always works with clean, current lead data.',
    tags: ['CRM sync', 'Lead capture', 'Call analytics', 'Pipeline visibility'],
  },
];

const faqs = [
  {
    question: 'How does Conversational AI Agent help with lead generation?',
    answer:
      'You can automate outbound and inbound lead workflows, qualify prospects, route hot leads, and schedule follow-up meetings without adding manual work to your team.',
  },
  {
    question: 'Can Conversational AI Agent make outbound calls to prospects?',
    answer:
      'Yes. The assistant can run prospecting calls at scale, follow approved scripts, and adapt to common objections while keeping the conversation natural.',
  },
  {
    question: 'How does Conversational AI Agent qualify leads automatically?',
    answer:
      'You define the qualification criteria, and the assistant asks the right questions, scores the lead, and forwards qualified prospects to your team or CRM.',
  },
  {
    question: 'Can I integrate Conversational AI Agent with my CRM or lead management tools?',
    answer:
      'Yes. You can connect to CRM systems, spreadsheets, APIs, and other lead tools so the assistant can sync outcomes and update records automatically.',
  },
  {
    question: 'What kind of industries can use Conversational AI Agent for lead generation?',
    answer:
      'Sales teams in SaaS, real estate, insurance, education, agencies, and local services can all use the platform for outbound and inbound lead generation.',
  },
  {
    question: 'Can Conversational AI Agent personalize lead calls?',
    answer:
      'Yes. You can tailor tone, script, language, and routing logic so each call feels relevant to the prospect and your campaign.',
  },
  {
    question: "How does Conversational AI Agent ensure leads don't drop off?",
    answer:
      'The assistant can follow up automatically, send reminders, capture contact details, and schedule meetings immediately so leads do not go cold.',
  },
  {
    question: 'Can Conversational AI Agent send leads to my sales team after qualification?',
    answer:
      'Yes. Qualified leads can be handed off with summaries, tags, and next-step context so your sales team can act immediately.',
  },
  {
    question: 'How quickly can I launch a campaign?',
    answer:
      'You can launch fast using templates, workflows, and approved call scripts, then refine the campaign as results come in.',
  },
  {
    question: 'Can Conversational AI Agent run campaigns in multiple languages?',
    answer:
      'Yes. You can create multilingual campaigns so prospects can speak in the language they prefer.',
  },
  {
    question: 'How does Conversational AI Agent price lead generation campaigns?',
    answer:
      'Pricing depends on your campaign needs, call volume, and configuration. You can start small and scale as you grow.',
  },
];

export default function LeadGenerationPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <main className="min-h-screen bg-white text-black dark:bg-[#050505] dark:text-white transition-colors duration-300" style={{ fontFamily: 'var(--font-main)' }}>
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-transparent dark:bg-[radial-gradient(circle_at_top_left,rgba(14,179,158,0.18),transparent_28%),radial-gradient(circle_at_top_right,rgba(14,179,158,0.12),transparent_26%),linear-gradient(180deg,#090909_0%,#050505_100%)]" />
        <div className="absolute inset-x-0 top-[88px] h-[460px] bg-gradient-to-b from-transparent to-transparent dark:bg-[radial-gradient(circle_at_50%_0%,rgba(14,179,158,0.12),transparent_60%)]" />

        <Navbar />

        <section className="relative mx-auto max-w-[1480px] px-6 pb-20 pt-6 lg:px-10 lg:pb-24 lg:pt-10">
          <div className="grid gap-10 lg:grid-cols-[1.04fr_0.96fr] lg:gap-12">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
              className="pt-14 lg:pt-20"
            >
              <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-[#0eb39e]/30 dark:border-[#0eb39e]/30 bg-[#0eb39e]/8 dark:bg-[#0eb39e]/8 px-5 py-2 text-[14px] text-[#0eb39e] dark:text-[#20d8df] shadow-[0_0_0_1px_rgba(14,179,158,0.05)] transition-colors">
                <Sparkles className="h-4 w-4" />
                Lead Generation Voice AI Solutions
              </div>

              <h1 className="max-w-[720px] text-[46px] font-extrabold leading-[1.06] tracking-[-0.05em] text-black dark:text-white lg:text-[58px]">
                Generate Leads <span className="text-[#0eb39e] dark:text-[#21c7d0]">On Autopilot</span>
              </h1>

              <p className="mt-7 max-w-[700px] text-[18px] leading-[1.75] text-gray-700 dark:text-white/70">
                Generate high-quality leads 24/7 with AI-powered calling. Qualify prospects, handle objections, and book meetings automatically.
              </p>

              <div className="mt-12 space-y-6">
                {heroPoints.map((point) => (
                  <div key={point.title} className="flex gap-4 text-[17px] leading-[1.6] text-gray-700 dark:text-white/70">
                    <div className="mt-2.5 flex h-5 w-[2px] shrink-0 flex-col justify-between">
                      <span className="h-[18px] w-[2px] rounded-full bg-[#19cfd4]" />
                      <span className="h-[18px] w-[2px] rounded-full bg-[#19cfd4] opacity-70" />
                    </div>
                    <p>
                      <strong className="font-semibold text-black dark:text-white">{point.title}</strong> - {point.description}
                    </p>
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.7, ease: 'easeOut', delay: 0.05 }}
              className="pt-2 lg:pt-4"
            >
              <div className="rounded-[28px] border border-[#0eb39e]/18 bg-white dark:bg-[#081112] p-6 shadow-lg dark:shadow-[0_30px_80px_rgba(0,0,0,0.45)] lg:p-8 transition-colors">
                <div className="mb-6 flex items-center gap-3">
                  <Sparkles className="h-5 w-5 text-[#19cfd4]" />
                  <h2 className="text-[30px] font-extrabold tracking-[-0.03em] text-black dark:text-white lg:text-[34px]">
                    Create your <span className="text-[#0eb39e] dark:text-[#21c7d0]">Free</span> Voice AI Assistant
                  </h2>
                </div>

                <textarea
                  rows={6}
                  className="min-h-[174px] w-full rounded-[8px] border border-gray-300 dark:border-[#17393b] bg-white dark:bg-[#050808] px-4 py-4 text-[14px] leading-[1.55] text-gray-700 dark:text-white/70 outline-none transition-colors placeholder:text-gray-500 dark:placeholder:text-white/36 focus:border-[#0eb39e] dark:focus:border-[#19cfd4]/80 focus:ring-1 focus:ring-[#0eb39e] dark:focus:ring-[#19cfd4]"
                  placeholder="Example: Create an AI agent that makes cold calls to B2B prospects, qualifies leads based on budget and timeline, handles objections professionally, and books meetings with interested prospects..."
                />

                <div className="mt-4 text-[12px] font-semibold text-gray-500 dark:text-white/42">Quick Start Templates:</div>
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                  {leadTemplates.map((template) => (
                    <TemplateChip key={template.label} label={template.label} icon={template.icon} />
                  ))}
                </div>

                <motion.button
                  whileHover={{ scale: 1.015 }}
                  whileTap={{ scale: 0.985 }}
                  className="mt-6 flex h-[46px] w-full items-center justify-center gap-2 rounded-[6px] bg-[#0eb39e] dark:bg-[#0f8d90] text-[18px] font-medium text-white transition-colors hover:bg-[#0cd4bc] dark:hover:bg-[#18a6aa]"
                >
                  Create Free Agent
                  <ChevronRight className="h-5 w-5" />
                </motion.button>
              </div>
            </motion.div>
          </div>
        </section>

        <section className="relative mx-auto max-w-[1480px] px-6 pb-24 lg:px-10 lg:pb-28">
          <div className="text-center">
            <h2 className="text-[54px] font-extrabold tracking-[-0.05em] text-black dark:text-white lg:text-[60px]">
              Lead Generation Voice AI <span className="text-[#0eb39e] dark:text-[#19cfd4]">Solutions</span>
            </h2>
            <p className="mt-4 text-[20px] text-gray-600 dark:text-white/65">Scale your outreach without scaling your team</p>
          </div>

          <div className="mt-14 grid gap-6 lg:grid-cols-2">
            {featureCards.map((card) => (
              <FeatureCard key={card.title} {...card} />
            ))}
          </div>
        </section>

        <section className="relative mx-auto max-w-[1480px] px-6 pb-24 lg:px-10 lg:pb-28">
          <div className="text-center">
            <h2 className="text-[48px] font-extrabold tracking-[-0.05em] text-black dark:text-white lg:text-[58px]">
              Frequently Asked <span className="text-[#0eb39e] dark:text-[#19cfd4]">Questions</span>
            </h2>
            <p className="mt-4 text-[18px] text-gray-600 dark:text-white/62">Common questions about lead generation AI</p>
          </div>

          <div className="mx-auto mt-14 max-w-[920px] space-y-4">
            {faqs.map((faq, index) => {
              const isOpen = openFaq === index;
              const questionId = `lead-gen-faq-question-${index}`;
              const answerId = `lead-gen-faq-answer-${index}`;

              return (
                <div
                  key={faq.question}
                  className="overflow-hidden rounded-[16px] border border-gray-300 dark:border-[#0d3133] bg-white dark:bg-[#060707] transition-colors hover:border-[#0eb39e]/60 dark:hover:border-[#0eb39e]/60"
                >
                  <button
                    id={questionId}
                    type="button"
                    className="flex w-full items-center justify-between px-7 py-6 text-left transition-colors hover:bg-gray-50 dark:hover:bg-[#0a1a1a]"
                    onClick={() => setOpenFaq(isOpen ? null : index)}
                    aria-expanded={isOpen}
                    aria-controls={answerId}
                  >
                    <span className="max-w-[86%] text-[21px] font-semibold tracking-[-0.03em] text-black dark:text-white">
                      {faq.question}
                    </span>
                    <ChevronDown
                      className={`h-5 w-5 shrink-0 text-[#0eb39e] dark:text-[#19cfd4] transition-transform duration-300 ${
                        isOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  <motion.div
                    id={answerId}
                    role="region"
                    aria-labelledby={questionId}
                    initial={false}
                    animate={{ height: isOpen ? 'auto' : 0, opacity: isOpen ? 1 : 0 }}
                    transition={{ duration: 0.28, ease: 'easeOut' }}
                    className="overflow-hidden"
                  >
                    <div className="px-7 pb-6 pt-0 text-[15px] leading-[1.8] text-gray-700 dark:text-white/65">
                      {faq.answer}
                    </div>
                  </motion.div>
                </div>
              );
            })}
          </div>

          <div className="mt-14 text-center">
            <p className="text-[18px] text-gray-600 dark:text-white/52">Still have questions? We're here to help.</p>
            <Link to="/contact" className="mt-4 inline-flex items-center gap-2 text-[18px] font-semibold text-[#0eb39e] dark:text-[#19cfd4] transition-colors hover:text-[#0cd4bc] dark:hover:text-[#26f0f6]">
              Contact our team
              <ChevronRight className="h-5 w-5" />
            </Link>
          </div>
        </section>

        <FooterBlock />

        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          whileHover={{ scale: 1.06 }}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-full bg-[#0eb39e] dark:bg-[#15254a] px-5 py-3 text-[16px] font-semibold text-white dark:text-[#c7f9ff] shadow-lg dark:shadow-[0_18px_40px_rgba(0,0,0,0.45)] transition-transform"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/50 dark:border-[#19cfd4]/50 text-[18px] text-white dark:text-[#19cfd4]">O</span>
          Ask Kevin
        </motion.button>
      </div>
    </main>
  );
}

function NavButton({ label }: { label: string }) {
  return (
    <button type="button" className="inline-flex items-center gap-1.5 text-gray-600 dark:text-white/55 transition-colors hover:text-black dark:hover:text-white">
      <span>{label}</span>
      <ChevronDown className="h-3 w-3 opacity-75" />
    </button>
  );
}

function NavLink({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="text-gray-600 dark:text-white/55 transition-colors hover:text-black dark:hover:text-white">
      {label}
    </Link>
  );
}

function TemplateChip({ label, icon: Icon }: { label: string; icon: LucideIcon }) {
  return (
    <button
      type="button"
      className="flex h-[42px] items-center gap-3 rounded-[9px] border border-gray-300 dark:border-[#0d4e4f] bg-gray-50 dark:bg-[#061213] px-4 text-left text-[15px] text-black dark:text-[#2bd8e0] transition-colors hover:border-[#0eb39e] dark:hover:border-[#19cfd4]/70 hover:bg-gray-100 dark:hover:bg-[#07191a]"
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="font-medium leading-none">{label}</span>
    </button>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  description,
  tags,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  tags: string[];
}) {
  return (
    <div className="rounded-[22px] border border-gray-300 dark:border-[#0d3133] bg-white dark:bg-[#060707] p-8 shadow-md dark:shadow-[0_10px_30px_rgba(0,0,0,0.25)] transition-colors">
      <div className="flex items-start gap-5">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[14px] bg-gray-100 dark:bg-[#0c2526] text-[#0eb39e] dark:text-[#19cfd4] shadow-[inset_0_0_0_1px_rgba(25,207,212,0.06)]">
          <Icon className="h-7 w-7" />
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="text-[25px] font-extrabold tracking-[-0.04em] text-black dark:text-white">{title}</h3>
          <p className="mt-4 max-w-[520px] text-[16px] leading-[1.8] text-gray-700 dark:text-white/58">{description}</p>

          <div className="mt-7 flex flex-wrap gap-3">
            {tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-gray-300 dark:border-[#0d4e4f] bg-gray-50 dark:bg-[#071313] px-4 py-2 text-[13px] text-gray-600 dark:text-[#1dcdd5] transition-colors"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function FooterBlock() {
  return (
    <footer className="relative border-t border-gray-300 dark:border-white/6 bg-white dark:bg-[#050505] pb-10 pt-24 transition-colors">
      <div className="mx-auto max-w-[1480px] px-6 lg:px-10">
        <div className="grid gap-14 lg:grid-cols-[0.9fr_1fr_1fr_1fr_1fr]">
          <div>
            <div className="flex h-20 w-20 items-center justify-center rounded-[22px] border border-gray-300 dark:border-white/8 bg-gray-100 dark:bg-[#0b1118] text-[52px] font-black tracking-[-0.05em] text-[#0eb39e] dark:text-[#19cfd4] shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
              O
            </div>
            <p className="mt-6 text-[18px] font-semibold text-black dark:text-white/92">Ask AI about Conversational AI Agent</p>
            <div className="mt-5 flex gap-3">
              <FooterIconLabel label="◎" />
              <FooterIconLabel label="AI" />
              <FooterIconLabel label="✦" />
              <FooterIconLabel label="✧" />
            </div>
            <div className="mt-6 text-[16px] text-gray-600 dark:text-white/72">👋 Hey AI, learn about us →</div>
          </div>

          <FooterColumn
            heading="Solutions"
            items={['BY INDUSTRY', 'Real Estate', 'Healthcare', 'Insurance', 'Restaurants', 'Finance', 'Education', 'E-commerce', 'BY USE CASE', 'Lead Generation', 'Collections']}
          />
          <FooterColumn heading="Product" items={['Pricing', 'Integrations', 'Telephony', 'Multilingual', 'Instant Voice', 'Agent Relay (for agencies)']} />
          <FooterColumn heading="Resources" items={['Blog', 'Documentation', 'Product Updates']} />
          <FooterColumn
            heading="Sales & Support"
            items={['Book a Demo', 'Contact Sales', 'Enterprise Sales', 'Report an Issue', 'LEGAL', 'Privacy Policy', 'Terms of Use']}
          />
        </div>

        <div className="mt-24 flex flex-col gap-6 border-t border-gray-300 dark:border-white/6 pt-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="text-[14px] text-gray-600 dark:text-white/42">© 2026 Conversational AI Agent</div>
          <div className="flex items-center gap-4 text-gray-600 dark:text-white/42">
            <span>in</span>
            <span>X</span>
            <span>◎</span>
            <span>▶</span>
            <span>◉</span>
            <span>☼</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterIconLabel({ label }: { label: string }) {
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-gray-300 dark:border-white/10 bg-gray-100 dark:bg-[#171717] text-[14px] text-gray-700 dark:text-white/72">
      {label}
    </div>
  );
}

function FooterColumn({ heading, items }: { heading: string; items: string[] }) {
  return (
    <div>
      <div className="text-[16px] font-semibold text-black dark:text-white/88">{heading}</div>
      <div className="mt-7 space-y-4 text-[15px] text-gray-600 dark:text-white/50">
        {items.map((item) => (
          <div key={item} className={item === 'BY INDUSTRY' || item === 'BY USE CASE' || item === 'LEGAL' ? 'mt-2 text-[13px] font-semibold uppercase tracking-[0.18em] text-gray-700 dark:text-white/72' : ''}>
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}
