import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Bell,
  ChevronDown,
  ChevronRight,
  Headphones,
  Package,
  Repeat2,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Truck,
  type LucideIcon,
} from 'lucide-react';

const heroPoints = [
  {
    title: 'Order Management',
    description: 'Track orders, provide updates, and handle modifications',
  },
  {
    title: 'Product Support',
    description: 'Answer questions, troubleshoot issues, and guide usage',
  },
  {
    title: 'Smart Returns',
    description: 'Process returns smoothly, offer exchanges, and negotiate solutions',
  },
];

const ecommerceTemplates: Array<{ label: string; icon: LucideIcon }> = [
  { label: 'Order Status Tracker', icon: ShoppingBag },
  { label: 'Product Inquiry Assistant', icon: Package },
  { label: 'Return & Exchange Handler', icon: Repeat2 },
  { label: 'Technical Support', icon: Headphones },
  { label: 'Order Confirmation Calls', icon: ShoppingCart },
  { label: 'Abandoned Cart Recovery', icon: Sparkles },
  { label: 'Delivery Notifications', icon: Truck },
  { label: 'Review Request Calls', icon: Bell },
];

const featureCards = [
  {
    icon: ShoppingBag,
    title: 'Order Confirmation Agent',
    description:
      'Handle both inbound and outbound calls. Inbound: product info, returns, negotiations, smart transfers. Outbound: availability alerts and order confirmations.',
    tags: ['Product information', 'Returns & negotiations', 'Dynamic call transfer', 'Availability notifications'],
  },
  {
    icon: Headphones,
    title: 'Product Support',
    description:
      'Answer product questions, troubleshoot issues, and provide usage guidance. Help customers get the most from their purchases.',
    tags: ['Product information', 'Troubleshooting help', 'Usage guidance', 'Compatibility checks'],
  },
  {
    icon: Repeat2,
    title: 'Returns & Exchanges',
    description:
      'Make returns effortless. Process returns, offer exchanges, and negotiate solutions that keep customers happy.',
    tags: ['Easy returns process', 'Exchange options', 'Refund tracking', 'Solution negotiation'],
  },
  {
    icon: Bell,
    title: 'Availability Notifications',
    description:
      'Notify customers when products are back in stock. Turn waitlists into sales with proactive outbound calls.',
    tags: ['Restock alerts', 'Wishlist notifications', 'Sale announcements', 'New arrivals'],
  },
];

const faqs = [
  {
    question: 'How can OmniDimension help my eCommerce business?',
    answer:
      'You can create voice assistants that handle order updates, product questions, return requests, and outbound notifications while keeping the buying experience responsive.',
  },
  {
    question: 'Can the AI handle order status or delivery inquiries?',
    answer:
      'Yes. The assistant can check order context, answer delivery questions, and provide consistent status updates to customers.',
  },
  {
    question: 'Can OmniDimension make promotional or marketing calls?',
    answer:
      'Yes. You can use the assistant for promotions, restock alerts, abandoned cart recovery, and other outreach workflows aligned with your rules.',
  },
  {
    question: 'How does OmniDimension improve customer retention?',
    answer:
      'By reducing wait times, improving issue resolution, and following up automatically with helpful notifications and support calls.',
  },
  {
    question: 'Does OmniDimension support multilingual communication with customers?',
    answer:
      'Yes. You can configure multilingual voice experiences so customers can interact in the language they prefer.',
  },
  {
    question: 'Can OmniDimension handle return or refund requests?',
    answer:
      'Yes. The assistant can guide customers through return and refund workflows, collect the right details, and escalate when needed.',
  },
  {
    question: 'Can OmniDimension collect reviews or feedback from buyers?',
    answer:
      'Yes. You can automate review follow-ups and feedback collection after delivery or support resolution.',
  },
];

export default function EcommercePage() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <main className="min-h-screen bg-[#050505] text-white" style={{ fontFamily: 'var(--font-main)' }}>
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(14,179,158,0.18),transparent_28%),radial-gradient(circle_at_top_right,rgba(14,179,158,0.12),transparent_26%),linear-gradient(180deg,#090909_0%,#050505_100%)]" />
        <div className="absolute inset-x-0 top-[88px] h-[460px] bg-[radial-gradient(circle_at_50%_0%,rgba(14,179,158,0.12),transparent_60%)]" />

        <header className="sticky top-0 z-40 border-b border-white/6 bg-[rgba(5,5,5,0.82)] backdrop-blur-xl">
          <div className="mx-auto flex h-[82px] max-w-[1480px] items-center justify-between px-6 lg:px-10">
            <Link to="/" className="flex items-center gap-2 text-[18px] font-black tracking-[-0.04em] text-white">
              <span className="text-[#21e4ef]">OMNI</span>
              <span>DIMENSION</span>
            </Link>

            <nav className="hidden items-center gap-8 text-[15px] text-white/70 xl:flex">
              <NavButton label="Solutions" />
              <NavButton label="Whitelabel" />
              <NavLink to="/pricing" label="Pricing" />
              <NavButton label="Resources" />
              <NavButton label="Contact Us" />
            </nav>

            <div className="flex items-center gap-5 text-sm font-medium">
              <Link to="/dashboard" className="hidden text-white/65 transition-colors hover:text-white md:block">
                Dashboard
              </Link>
              <Link
                to="/login"
                className="rounded-[10px] border border-[#0eb39e] bg-transparent px-4 py-2.5 text-white transition-colors hover:bg-[#0eb39e]/10"
              >
                Sign Out
              </Link>
            </div>
          </div>
        </header>

        <section className="relative mx-auto max-w-[1480px] px-6 pb-20 pt-6 lg:px-10 lg:pb-24 lg:pt-10">
          <div className="grid gap-10 lg:grid-cols-[1.04fr_0.96fr] lg:gap-12">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
              className="pt-14 lg:pt-20"
            >
              <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-[#0eb39e]/30 bg-[#0eb39e]/8 px-5 py-2 text-[14px] text-[#20d8df] shadow-[0_0_0_1px_rgba(14,179,158,0.05)]">
                <ShoppingCart className="h-4 w-4" />
                E-commerce Voice AI Solutions
              </div>

              <h1 className="max-w-[720px] text-[46px] font-extrabold leading-[1.06] tracking-[-0.05em] text-white lg:text-[58px]">
                Never Miss a <span className="text-[#21c7d0]">Sale</span> with Voice AI
              </h1>

              <p className="mt-7 max-w-[700px] text-[18px] leading-[1.75] text-white/70">
                Handle order inquiries, product support, returns, and customer notifications with intelligent voice assistants.
                Turn every call into a sales opportunity.
              </p>

              <div className="mt-12 space-y-6">
                {heroPoints.map((point) => (
                  <div key={point.title} className="flex gap-4 text-[17px] leading-[1.6] text-white/70">
                    <div className="mt-2.5 flex h-5 w-[2px] shrink-0 flex-col justify-between">
                      <span className="h-[18px] w-[2px] rounded-full bg-[#19cfd4]" />
                      <span className="h-[18px] w-[2px] rounded-full bg-[#19cfd4] opacity-70" />
                    </div>
                    <p>
                      <strong className="font-semibold text-white">{point.title}</strong> - {point.description}
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
              <div className="rounded-[28px] border border-[#0eb39e]/18 bg-[#081112] p-6 shadow-[0_30px_80px_rgba(0,0,0,0.45)] lg:p-8">
                <div className="mb-6 flex items-center gap-3">
                  <Sparkles className="h-5 w-5 text-[#19cfd4]" />
                  <h2 className="text-[30px] font-extrabold tracking-[-0.03em] text-white lg:text-[34px]">
                    Create your <span className="text-[#21c7d0]">Free</span> Voice AI Assistant
                  </h2>
                </div>

                <textarea
                  rows={6}
                  className="min-h-[174px] w-full rounded-[8px] border border-[#17393b] bg-[#050808] px-4 py-4 text-[14px] leading-[1.55] text-white/70 outline-none transition-colors placeholder:text-white/36 focus:border-[#19cfd4]/80"
                  placeholder="Example: Create an e-commerce assistant that handles order inquiries, provides product support, processes returns, and notifies customers about restocked items..."
                />

                <div className="mt-4 text-[12px] font-semibold text-white/42">Quick Start Templates:</div>
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                  {ecommerceTemplates.map((template) => (
                    <TemplateChip key={template.label} label={template.label} icon={template.icon} />
                  ))}
                </div>

                <motion.button
                  whileHover={{ scale: 1.015 }}
                  whileTap={{ scale: 0.985 }}
                  className="mt-6 flex h-[46px] w-full items-center justify-center gap-2 rounded-[6px] bg-[#0f8d90] text-[18px] font-medium text-white transition-colors hover:bg-[#18a6aa]"
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
            <h2 className="text-[54px] font-extrabold tracking-[-0.05em] text-white lg:text-[60px]">
              E-commerce Voice AI <span className="text-[#19cfd4]">Solution</span>
            </h2>
            <p className="mt-4 text-[20px] text-white/65">
              Transform every customer interaction into an opportunity to delight and sell
            </p>
          </div>

          <div className="mt-14 grid gap-6 lg:grid-cols-2">
            {featureCards.map((card) => (
              <FeatureCard key={card.title} {...card} />
            ))}
          </div>
        </section>

        <section className="relative mx-auto max-w-[1480px] px-6 pb-24 lg:px-10 lg:pb-28">
          <div className="text-center">
            <h2 className="text-[48px] font-extrabold tracking-[-0.05em] text-white lg:text-[58px]">
              Frequently Asked <span className="text-[#19cfd4]">Questions</span>
            </h2>
            <p className="mt-4 text-[18px] text-white/62">Common questions about the e-commerce voice solution</p>
          </div>

          <div className="mx-auto mt-14 max-w-[920px] space-y-4">
            {faqs.map((faq, index) => {
              const isOpen = openFaq === index;
              const questionId = `ecommerce-faq-question-${index}`;
              const answerId = `ecommerce-faq-answer-${index}`;

              return (
                <div
                  key={faq.question}
                  className="overflow-hidden rounded-[16px] border border-[#0d3133] bg-[#060707] transition-colors hover:border-[#0eb39e]/60"
                >
                  <button
                    id={questionId}
                    type="button"
                    className="flex w-full items-center justify-between px-7 py-6 text-left transition-colors hover:bg-[#0a1a1a]"
                    onClick={() => setOpenFaq(isOpen ? null : index)}
                    aria-expanded={isOpen}
                    aria-controls={answerId}
                  >
                    <span className="max-w-[86%] text-[21px] font-semibold tracking-[-0.03em] text-white">
                      {faq.question}
                    </span>
                    <ChevronDown
                      className={`h-5 w-5 shrink-0 text-[#19cfd4] transition-transform duration-300 ${
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
                    <div className="px-7 pb-6 pt-0 text-[15px] leading-[1.8] text-white/65">
                      {faq.answer}
                    </div>
                  </motion.div>
                </div>
              );
            })}
          </div>

          <div className="mt-14 text-center">
            <p className="text-[18px] text-white/52">Still have questions? We're here to help.</p>
            <Link
              to="/contact"
              className="mt-4 inline-flex items-center gap-2 text-[18px] font-semibold text-[#19cfd4] transition-colors hover:text-[#26f0f6]"
            >
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
          className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-full bg-[#15254a] px-5 py-3 text-[16px] font-semibold text-[#c7f9ff] shadow-[0_18px_40px_rgba(0,0,0,0.45)] transition-transform"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full border border-[#19cfd4]/50 text-[18px] text-[#19cfd4]">O</span>
          Ask Kevin
        </motion.button>
      </div>
    </main>
  );
}

function NavButton({ label }: { label: string }) {
  return (
    <button type="button" className="inline-flex items-center gap-1.5 text-white/55 transition-colors hover:text-white">
      <span>{label}</span>
      <ChevronDown className="h-3 w-3 opacity-75" />
    </button>
  );
}

function NavLink({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="text-white/55 transition-colors hover:text-white">
      {label}
    </Link>
  );
}

function TemplateChip({ label, icon: Icon }: { label: string; icon: LucideIcon }) {
  return (
    <button
      type="button"
      className="flex h-[42px] items-center gap-3 rounded-[9px] border border-[#0d4e4f] bg-[#061213] px-4 text-left text-[15px] text-[#2bd8e0] transition-colors hover:border-[#19cfd4]/70 hover:bg-[#07191a]"
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
    <div className="rounded-[22px] border border-[#0d3133] bg-[#060707] p-8 shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
      <div className="flex items-start gap-5">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[14px] bg-[#0c2526] text-[#19cfd4] shadow-[inset_0_0_0_1px_rgba(25,207,212,0.06)]">
          <Icon className="h-7 w-7" />
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="text-[25px] font-extrabold tracking-[-0.04em] text-white">{title}</h3>
          <p className="mt-4 max-w-[520px] text-[16px] leading-[1.8] text-white/58">{description}</p>

          <div className="mt-7 flex flex-wrap gap-3">
            {tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-[#0d4e4f] bg-[#071313] px-4 py-2 text-[13px] text-[#1dcdd5]"
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
    <footer className="relative border-t border-white/6 bg-[#050505] pb-10 pt-24">
      <div className="mx-auto max-w-[1480px] px-6 lg:px-10">
        <div className="grid gap-14 lg:grid-cols-[0.9fr_1fr_1fr_1fr_1fr]">
          <div>
            <div className="flex h-20 w-20 items-center justify-center rounded-[22px] border border-white/8 bg-[#0b1118] text-[52px] font-black tracking-[-0.05em] text-[#19cfd4] shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
              O
            </div>
            <p className="mt-6 text-[18px] font-semibold text-white/92">Ask AI about OmniDimension</p>
            <div className="mt-5 flex gap-3">
              <FooterIconLabel label="◎" />
              <FooterIconLabel label="AI" />
              <FooterIconLabel label="✦" />
              <FooterIconLabel label="✧" />
            </div>
            <div className="mt-6 text-[16px] text-white/72">👋 Hey AI, learn about us →</div>
          </div>

          <FooterColumn
            heading="Solutions"
            items={['BY INDUSTRY', 'Real Estate', 'Healthcare', 'Insurance', 'Restaurants', 'Finance', 'Education', 'E-commerce', 'BY USE CASE', 'Lead Generation', 'Collections']}
          />
          <FooterColumn heading="Product" items={['Pricing', 'Integrations', 'Telephony', 'Multilingual', 'Instant Voice', 'OmniRelay (for agencies)']} />
          <FooterColumn heading="Resources" items={['Blog', 'Documentation', 'Product Updates']} />
          <FooterColumn
            heading="Sales & Support"
            items={['Book a Demo', 'Contact Sales', 'Enterprise Sales', 'Report an Issue', 'LEGAL', 'Privacy Policy', 'Terms of Use']}
          />
        </div>

        <div className="mt-24 flex flex-col gap-6 border-t border-white/6 pt-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="text-[14px] text-white/42">© 2026 OmniDimension</div>
          <div className="flex items-center gap-4 text-white/42">
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
    <div className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-white/10 bg-[#171717] text-[14px] text-white/72">
      {label}
    </div>
  );
}

function FooterColumn({ heading, items }: { heading: string; items: string[] }) {
  return (
    <div>
      <div className="text-[16px] font-semibold text-white/88">{heading}</div>
      <div className="mt-7 space-y-4 text-[15px] text-white/50">
        {items.map((item) => (
          <div key={item} className={item === 'BY INDUSTRY' || item === 'BY USE CASE' || item === 'LEGAL' ? 'mt-2 text-[13px] font-semibold uppercase tracking-[0.18em] text-white/72' : ''}>
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}
