import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart3,
  Bell,
  Calendar,
  CalendarCheck,
  CheckCircle,
  Clock,
  CreditCard,
  Headphones,
  LifeBuoy,
  MessageCircle,
  MessagesSquare,
  PhoneCall,
  RefreshCw,
  Scale,
  ShieldCheck,
  Sparkles,
  UserCheck,
  WalletCards,
  ArrowRight,
  ChevronDown,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { SolutionIconKey, SolutionUseCaseContent } from './useCaseContent';

const iconMap: Record<SolutionIconKey, LucideIcon> = {
  'bar-chart': BarChart3,
  bell: Bell,
  calendar: Calendar,
  'calendar-check': CalendarCheck,
  'check-circle': CheckCircle,
  clock: Clock,
  'credit-card': CreditCard,
  headphones: Headphones,
  'life-buoy': LifeBuoy,
  'message-circle': MessageCircle,
  messages: MessagesSquare,
  'phone-call': PhoneCall,
  refresh: RefreshCw,
  scale: Scale,
  shield: ShieldCheck,
  sparkles: Sparkles,
  'user-check': UserCheck,
  wallet: WalletCards,
};

function SolutionIcon({ icon, size = 22 }: { icon: SolutionIconKey; size?: number }) {
  const Icon = iconMap[icon];
  return <Icon size={size} aria-hidden="true" />;
}

function QuickStartCard({
  content,
  headingId,
  compact = false,
}: {
  content: SolutionUseCaseContent;
  headingId: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`solution-template-panel solution-template-panel-collections ${
        compact ? 'solution-template-panel-hero' : ''
      }`}
    >
      <div>
        {!compact && <div className="solution-eyebrow">Quick Start Templates</div>}
        <h2 id={headingId}>Create your Free Voice AI Assistant</h2>
        {!compact && <p>Start from a focused workflow, then tailor the assistant to your team, tone, and customer journey.</p>}
      </div>

      <div className="solution-template-content">
        {content.templatePrompt && <div className="solution-template-prompt">{content.templatePrompt}</div>}
        <div className="solution-template-label">Quick Start Templates:</div>
        <div className="solution-template-grid">
          {content.templates.map((template) => (
            <div className="solution-template-chip" key={template}>
              {template}
            </div>
          ))}
        </div>
      </div>

      <Link to="/dashboard" className="btn btn-primary">
        Create Free Agent
        <ArrowRight size={16} aria-hidden="true" />
      </Link>
    </div>
  );
}

function SolutionHero({ content }: { content: SolutionUseCaseContent }) {
  const headingId = `solution-${content.slug}-title`;

  return (
    <section className="solution-hero solution-hero-collections" aria-labelledby={headingId}>
      <div className="container">
        <div className="solution-hero-grid">
          <div className="solution-hero-copy">
            <div className="solution-eyebrow">{content.eyebrow}</div>
            <h1 id={headingId}>{content.title}</h1>
            <p>{content.description}</p>

            <div className="solution-hero-bullets" aria-label={`${content.title} benefits`}>
              {content.benefits.map((benefit) => (
                <div className="solution-hero-bullet" key={benefit.title}>
                  <span className="solution-hero-bullet-mark" aria-hidden="true" />
                  <p>
                    <strong>{benefit.title}</strong> - {benefit.description}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <QuickStartCard content={content} headingId={`solution-${content.slug}-templates`} compact />
        </div>
      </div>
    </section>
  );
}

function SolutionFeatureGrid({ content }: { content: SolutionUseCaseContent }) {
  const headingId = `solution-${content.slug}-features`;
  const featureHeading = content.featureHeading ?? 'Built for the way your team works';
  const featureDescription =
    content.featureDescription ?? 'Reusable voice workflows for real customer conversations, follow-ups, and operational handoffs.';

  return (
    <section className="solution-section" aria-labelledby={headingId}>
      <div className="container">
        <div className="solution-section-header">
          <div className="solution-eyebrow">{content.eyebrow}</div>
          <h2 id={headingId}>{featureHeading}</h2>
          <p>{featureDescription}</p>
        </div>

        <div className="solution-feature-grid">
          {content.features.map((feature) => (
            <article className="solution-feature-card" key={feature.title}>
              <div className="solution-icon">
                <SolutionIcon icon={feature.icon} />
              </div>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
              <div className="solution-point-list">
                {feature.points.map((point) => (
                  <span key={point}>{point}</span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function SolutionFAQ({ content }: { content: SolutionUseCaseContent }) {
  const [activeFaq, setActiveFaq] = useState<number | null>(0);
  const headingId = `solution-${content.slug}-faq`;
  const faqHeading = content.faqHeading ?? `Common questions about ${content.slug.replace('-', ' ')}`;
  const faqDescription = content.faqDescription ?? 'Clear answers for teams evaluating this voice AI workflow.';

  return (
    <section className="solution-section solution-faq-section" aria-labelledby={headingId}>
      <div className="container">
        <div className="solution-section-header">
          <div className="solution-eyebrow">Frequently Asked Questions</div>
          <h2 id={headingId}>{faqHeading}</h2>
          <p>{faqDescription}</p>
        </div>

        <div className="solution-faq">
          {content.faqs.map((faq, index) => {
            const isOpen = activeFaq === index;
            const questionId = `solution-${content.slug}-faq-question-${index}`;
            const answerId = `solution-${content.slug}-faq-answer-${index}`;
            return (
              <div className={`solution-faq-item ${isOpen ? 'open' : ''}`} key={faq.question}>
                <button
                  id={questionId}
                  className="solution-faq-question"
                  type="button"
                  onClick={() => setActiveFaq(isOpen ? null : index)}
                  aria-expanded={isOpen}
                  aria-controls={answerId}
                >
                  <span>{faq.question}</span>
                  <ChevronDown size={20} aria-hidden="true" />
                </button>
                <div
                  id={answerId}
                  className="solution-faq-answer"
                  role="region"
                  aria-labelledby={questionId}
                  hidden={!isOpen}
                >
                  <p>{faq.answer}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function SolutionCTA({ content }: { content: SolutionUseCaseContent }) {
  const headingId = `solution-${content.slug}-cta`;

  return (
    <section className="solution-section" aria-labelledby={headingId}>
      <div className="container">
        <div className="solution-cta">
          <div>
            <div className="solution-eyebrow">Ready to launch</div>
            <h2 id={headingId}>{content.cta.title}</h2>
            <p>{content.cta.description}</p>
          </div>
          <div className="solution-actions">
            <Link to="/dashboard" className="btn btn-primary btn-lg">
              {content.cta.primaryLabel}
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <Link to="/book-appointment" className="btn btn-secondary btn-lg">
              {content.cta.secondaryLabel}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function SolutionUseCasePage({ content }: { content: SolutionUseCaseContent }) {
  return (
    <main className="solution-page">
      <SolutionHero content={content} />
      <SolutionFeatureGrid content={content} />
      <SolutionFAQ content={content} />
      <SolutionCTA content={content} />
    </main>
  );
}
