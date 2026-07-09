import { useParams, Link } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Zap,
  Clock,
  Bot,
  Globe,
  ShieldCheck,
  BarChart3,
  Sparkles,
  ThumbsUp,
  Activity,
  Timer,
  Star,
} from 'lucide-react';
import { getUseCaseBySlug, useCases } from '../data/useCases';
import UseCaseNotFound from './UseCaseNotFound';

/* ─────────────────────── helpers ─────────────────────────────────────── */

/** Feature-card icons cycle: one per card position */
const FEATURE_ICONS = [Bot, Globe, Zap, ShieldCheck, BarChart3, Sparkles];

/** Trust badge data */
const TRUST_BADGES = [
  { icon: Clock, label: '24/7 Availability' },
  { icon: Bot,   label: 'Human-like Conversations' },
  { icon: ShieldCheck, label: 'Enterprise Ready' },
];

/** KPI cards shown in the metrics section */
const KPI_CARDS = [
  { icon: Timer,    stat: '< 1s',  label: 'Response Time',       sub: 'Average AI answer latency' },
  { icon: Activity, stat: '94%',   label: 'Automation Rate',      sub: 'Calls handled end-to-end' },
  { icon: ThumbsUp, stat: '4.8★',  label: 'Customer Satisfaction',sub: 'Avg. post-call CSAT score' },
  { icon: Clock,    stat: '24/7',  label: 'Availability',         sub: 'No downtime, no hold queues' },
];

/* ─────────────────────── useInView hook ─────────────────────────────── */
function useInView(ref: React.RefObject<HTMLElement | null>, cb: () => void) {
  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { cb(); observer.disconnect(); } },
      { threshold: 0.15 }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref, cb]);
}

/* ═══════════════════════ 1. Hero Section ════════════════════════════════ */
function HeroSection({
  heroHeading,
  heroDescription,
  subtitle,
  gradient,
  accentColor,
  icon: Icon,
  slug,
}: {
  heroHeading: string;
  heroDescription: string;
  subtitle: string;
  gradient: string;
  accentColor: string;
  icon: React.ElementType;
  slug: string;
}) {
  return (
    <section
      style={{
        position: 'relative',
        overflow: 'hidden',
        padding: '110px 0 96px',
        background: 'var(--bg-primary)',
      }}
    >
      {/* Ambient gradient blobs */}
      <div aria-hidden style={{ position:'absolute', top:'-140px', right:'-120px', width:'700px', height:'700px', background: gradient, borderRadius:'50%', filter:'blur(160px)', opacity:0.11, pointerEvents:'none' }} />
      <div aria-hidden style={{ position:'absolute', bottom:'-100px', left:'-100px', width:'450px', height:'450px', background: gradient, borderRadius:'50%', filter:'blur(130px)', opacity:0.07, pointerEvents:'none' }} />

      <div style={{ maxWidth:1100, margin:'0 auto', padding:'0 24px', position:'relative' }}>
        {/* Breadcrumb */}
        <nav aria-label="breadcrumb" style={{ display:'flex', alignItems:'center', gap:8, marginBottom:36, color:'var(--text-secondary)', fontSize:13 }}>
          <Link to="/" style={{ color:'var(--text-secondary)', textDecoration:'none' }}>Home</Link>
          <ChevronRight size={14} />
          <span style={{ color:'var(--text-muted)' }}>Use Cases</span>
          <ChevronRight size={14} />
          <span style={{ color: accentColor }}>{subtitle.split('—')[0].trim()}</span>
        </nav>

        <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:48, alignItems:'center' }}>
          {/* Left — text */}
          <div style={{ maxWidth: 680 }}>
            {/* Category badge */}
            <div style={{
              display:'inline-flex', alignItems:'center', gap:8,
              padding:'6px 16px', borderRadius:'var(--radius-full)',
              background:`${accentColor}18`, border:`1px solid ${accentColor}40`,
              marginBottom:28,
            }}>
              <Icon size={14} style={{ color: accentColor }} />
              <span style={{ fontSize:12, fontWeight:700, color: accentColor, letterSpacing:'0.08em' }}>
                AI VOICE AGENT
              </span>
            </div>

            <h1 style={{
              fontSize:'clamp(38px, 5.5vw, 64px)', fontWeight:900, lineHeight:1.08,
              letterSpacing:'-2px', color:'var(--text-primary)', fontFamily:'var(--font-main)',
              marginBottom:24,
            }}>
              {heroHeading}
            </h1>

            <p style={{ fontSize:18, lineHeight:1.75, color:'var(--text-secondary)', marginBottom:40, maxWidth:600 }}>
              {heroDescription}
            </p>

            {/* CTAs */}
            <div style={{ display:'flex', gap:14, flexWrap:'wrap', marginBottom:44 }}>
              <Link
                to={`/dashboard?template=${slug}`}
                id={`cta-create-agent-${slug}`}
                style={{
                  display:'inline-flex', alignItems:'center', gap:8,
                  padding:'15px 30px', borderRadius:'var(--radius-md)',
                  background: gradient, color:'#fff', fontWeight:800, fontSize:15,
                  textDecoration:'none', boxShadow:`0 4px 28px ${accentColor}45`,
                  transition:'transform 0.2s, box-shadow 0.2s',
                }}
                onMouseOver={e => { const el = e.currentTarget as HTMLElement; el.style.transform='translateY(-2px)'; el.style.boxShadow=`0 10px 36px ${accentColor}60`; }}
                onMouseOut={e  => { const el = e.currentTarget as HTMLElement; el.style.transform='translateY(0)';   el.style.boxShadow=`0 4px 28px ${accentColor}45`; }}
              >
                <Sparkles size={16} /> Create AI Agent
              </Link>

              <Link
                to="/book-appointment"
                id={`cta-book-demo-${slug}`}
                style={{
                  display:'inline-flex', alignItems:'center', gap:8,
                  padding:'15px 30px', borderRadius:'var(--radius-md)',
                  background:'var(--bg-card)', border:'1px solid var(--border)',
                  color:'var(--text-primary)', fontWeight:600, fontSize:15,
                  textDecoration:'none', transition:'border-color 0.2s, background 0.2s',
                }}
                onMouseOver={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor=accentColor; el.style.background=`${accentColor}10`; }}
                onMouseOut={e  => { const el = e.currentTarget as HTMLElement; el.style.borderColor='var(--border)'; el.style.background='var(--bg-card)'; }}
              >
                Book Demo
              </Link>
            </div>

            {/* Trust badges */}
            <div style={{ display:'flex', gap:20, flexWrap:'wrap' }}>
              {TRUST_BADGES.map(({ icon: BadgeIcon, label }) => (
                <div key={label} style={{ display:'flex', alignItems:'center', gap:7 }}>
                  <BadgeIcon size={14} style={{ color: accentColor }} />
                  <span style={{ fontSize:13, color:'var(--text-secondary)', fontWeight:500 }}>{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right — decorative visual card (desktop only) */}
          <div
            aria-hidden
            style={{
              display:'flex', flexDirection:'column', gap:14,
              minWidth:260, flexShrink:0,
            }}
            className="use-case-hero-visual"
          >
            {/* Live call card */}
            <div style={{
              background:'var(--bg-card)', border:`1px solid ${accentColor}30`,
              borderRadius:'var(--radius-lg)', padding:'20px 22px',
              boxShadow:`0 4px 32px ${accentColor}18`,
            }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
                <div style={{ width:10, height:10, borderRadius:'50%', background:'#34d399', boxShadow:'0 0 8px #34d399' }} />
                <span style={{ fontSize:12, fontWeight:700, color:'var(--text-secondary)', letterSpacing:'0.05em' }}>LIVE AGENT ACTIVE</span>
              </div>
              <div style={{ fontSize:14, color:'var(--text-primary)', lineHeight:1.6, marginBottom:10 }}>
                "Hello! I'm your AI assistant. How can I help you today?"
              </div>
              <div style={{ height:3, borderRadius:4, background:'var(--border)', overflow:'hidden' }}>
                <div style={{ height:'100%', width:'65%', background: gradient, borderRadius:4 }} />
              </div>
            </div>

            {/* Mini stats */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              {[{ v:'2,847', l:'Calls Today' }, { v:'98%', l:'Success Rate' }].map(({ v, l }) => (
                <div key={l} style={{
                  background:'var(--bg-card)', border:'1px solid var(--border)',
                  borderRadius:'var(--radius-md)', padding:'14px 16px', textAlign:'center',
                }}>
                  <div style={{ fontSize:22, fontWeight:900, background: gradient, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', letterSpacing:'-1px' }}>{v}</div>
                  <div style={{ fontSize:11, color:'var(--text-secondary)', marginTop:4 }}>{l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════ 2. Features Section ════════════════════════════ */
function FeaturesSection({
  features,
  accentColor,
}: {
  features: { title: string; description: string }[];
  accentColor: string;
}) {
  return (
    <section style={{ padding:'88px 0', background:'var(--bg-secondary)' }}>
      <div style={{ maxWidth:1100, margin:'0 auto', padding:'0 24px' }}>
        <div style={{ textAlign:'center', marginBottom:60 }}>
          <h2 style={{ fontSize:'clamp(28px, 3.5vw, 42px)', fontWeight:800, letterSpacing:'-0.8px', color:'var(--text-primary)', marginBottom:16 }}>
            Everything You Need
          </h2>
          <p style={{ color:'var(--text-secondary)', fontSize:17, maxWidth:520, margin:'0 auto' }}>
            Purpose-built capabilities that make this use case work out of the box.
          </p>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(300px, 1fr))', gap:24 }}>
          {features.map((f, idx) => {
            const FeatureIcon = FEATURE_ICONS[idx % FEATURE_ICONS.length];
            return (
              <div
                key={f.title}
                style={{
                  background:'var(--bg-card)', border:'1px solid var(--border)',
                  borderRadius:'var(--radius-lg)', padding:'28px 26px',
                  transition:'border-color 0.22s, transform 0.22s, box-shadow 0.22s',
                  cursor:'default', position:'relative', overflow:'hidden',
                }}
                onMouseOver={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor=`${accentColor}60`; el.style.transform='translateY(-5px)'; el.style.boxShadow=`0 12px 36px ${accentColor}18`; }}
                onMouseOut={e  => { const el = e.currentTarget as HTMLElement; el.style.borderColor='var(--border)'; el.style.transform='translateY(0)'; el.style.boxShadow='none'; }}
              >
                {/* top-right glow accent */}
                <div aria-hidden style={{ position:'absolute', top:-30, right:-30, width:100, height:100, background: accentColor, borderRadius:'50%', filter:'blur(50px)', opacity:0.07 }} />

                <div style={{
                  width:46, height:46, borderRadius:'var(--radius-md)',
                  background:`${accentColor}1a`, border:`1px solid ${accentColor}30`,
                  display:'flex', alignItems:'center', justifyContent:'center', marginBottom:20,
                }}>
                  <FeatureIcon size={22} style={{ color: accentColor }} />
                </div>
                <h3 style={{ fontSize:17, fontWeight:700, color:'var(--text-primary)', marginBottom:10, letterSpacing:'-0.3px' }}>
                  {f.title}
                </h3>
                <p style={{ fontSize:14, lineHeight:1.7, color:'var(--text-secondary)' }}>
                  {f.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════ 3. Workflow — horizontal timeline ══════════════ */
function WorkflowSection({
  steps,
  accentColor,
  gradient,
}: {
  steps: { step: number; title: string; description: string }[];
  accentColor: string;
  gradient: string;
}) {
  const sectionRef = useRef<HTMLElement>(null);

  useInView(sectionRef, () => {
    const nodes = sectionRef.current?.querySelectorAll<HTMLElement>('.wf-step');
    nodes?.forEach((el, i) => {
      setTimeout(() => {
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
      }, i * 120);
    });
  });

  return (
    <section ref={sectionRef} style={{ padding:'88px 0', background:'var(--bg-primary)', overflow:'hidden' }}>
      <div style={{ maxWidth:1100, margin:'0 auto', padding:'0 24px' }}>
        <div style={{ textAlign:'center', marginBottom:64 }}>
          <h2 style={{ fontSize:'clamp(28px, 3.5vw, 42px)', fontWeight:800, letterSpacing:'-0.8px', color:'var(--text-primary)', marginBottom:16 }}>
            How It Works
          </h2>
          <p style={{ color:'var(--text-secondary)', fontSize:17, maxWidth:480, margin:'0 auto' }}>
            From first contact to outcome — fully automated.
          </p>
        </div>

        {/* Horizontal timeline */}
        <div style={{ overflowX:'auto', paddingBottom:8 }}>
          <div style={{ display:'flex', gap:0, minWidth:'max-content', alignItems:'flex-start', position:'relative' }}>
            {steps.map((s, i) => (
              <div
                key={s.step}
                className="wf-step"
                style={{
                  display:'flex', flexDirection:'column', alignItems:'center',
                  flex:'1 0 180px', maxWidth:220, padding:'0 12px',
                  opacity:0, transform:'translateY(24px)',
                  transition:'opacity 0.5s ease, transform 0.5s ease',
                }}
              >
                {/* connector + bubble row */}
                <div style={{ display:'flex', alignItems:'center', width:'100%', marginBottom:24 }}>
                  {/* left line */}
                  {i > 0 && (
                    <div style={{ flex:1, height:2, background:`linear-gradient(to right, ${accentColor}80, ${accentColor}30)` }} />
                  )}
                  {/* step circle */}
                  <div style={{
                    width:52, height:52, borderRadius:'50%', flexShrink:0,
                    background: gradient, display:'flex', alignItems:'center', justifyContent:'center',
                    fontWeight:900, fontSize:18, color:'#fff',
                    boxShadow:`0 4px 20px ${accentColor}50`,
                    zIndex:1,
                  }}>
                    {s.step}
                  </div>
                  {/* right line */}
                  {i < steps.length - 1 && (
                    <div style={{ flex:1, height:2, background:`linear-gradient(to right, ${accentColor}30, ${accentColor}80)` }} />
                  )}
                </div>

                {/* text */}
                <h3 style={{ fontSize:15, fontWeight:700, color:'var(--text-primary)', textAlign:'center', marginBottom:8, letterSpacing:'-0.2px' }}>
                  {s.title}
                </h3>
                <p style={{ fontSize:13, lineHeight:1.65, color:'var(--text-secondary)', textAlign:'center', margin:0 }}>
                  {s.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════ 4. Benefits — two-column ═══════════════════════ */
function BenefitsSection({
  benefits,
  accentColor,
  gradient,
}: {
  benefits: { metric: string; label: string; description: string }[];
  accentColor: string;
  gradient: string;
}) {
  return (
    <section style={{ padding:'88px 0', background:'var(--bg-secondary)' }}>
      <div style={{ maxWidth:1100, margin:'0 auto', padding:'0 24px' }}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(340px, 1fr))', gap:56, alignItems:'center' }}>

          {/* Left — graphic */}
          <div style={{
            borderRadius:'var(--radius-lg)', overflow:'hidden', position:'relative',
            aspectRatio:'4/3', background:'var(--bg-card)', border:`1px solid ${accentColor}25`,
            display:'flex', alignItems:'center', justifyContent:'center',
          }}>
            <div aria-hidden style={{ position:'absolute', inset:0, background: gradient, opacity:0.06 }} />
            {/* Simulated dashboard graphic */}
            <div style={{ width:'80%', display:'flex', flexDirection:'column', gap:14, position:'relative' }}>
              {[80, 65, 90, 55, 75].map((w, i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:12 }}>
                  <div style={{ fontSize:11, color:'var(--text-muted)', width:26, textAlign:'right', flexShrink:0 }}>
                    {['Mon','Tue','Wed','Thu','Fri'][i]}
                  </div>
                  <div style={{ flex:1, height:10, borderRadius:6, background:'var(--border)' }}>
                    <div style={{
                      height:'100%', width:`${w}%`, borderRadius:6, background: gradient,
                      boxShadow:`0 0 10px ${accentColor}40`,
                    }} />
                  </div>
                  <span style={{ fontSize:11, color: accentColor, fontWeight:700, width:30 }}>{w}%</span>
                </div>
              ))}
              <div style={{ marginTop:4, padding:'14px 18px', background:`${accentColor}12`, borderRadius:'var(--radius-md)', border:`1px solid ${accentColor}30` }}>
                <div style={{ display:'flex', justifyContent:'space-between' }}>
                  <span style={{ fontSize:13, color:'var(--text-secondary)' }}>Avg. automation rate</span>
                  <span style={{ fontSize:15, fontWeight:800, background: gradient, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>94%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right — checklist */}
          <div>
            <h2 style={{ fontSize:'clamp(26px, 3.5vw, 40px)', fontWeight:800, letterSpacing:'-0.8px', color:'var(--text-primary)', marginBottom:16 }}>
              Measurable Results You Can Count On
            </h2>
            <p style={{ fontSize:16, color:'var(--text-secondary)', lineHeight:1.7, marginBottom:36 }}>
              Real outcomes from teams already deploying this AI workflow at scale.
            </p>

            <div style={{ display:'flex', flexDirection:'column', gap:22 }}>
              {benefits.map((b) => (
                <div key={b.label} style={{ display:'flex', gap:16, alignItems:'flex-start' }}>
                  <div style={{
                    width:42, height:42, borderRadius:'var(--radius-sm)', flexShrink:0,
                    background:`${accentColor}16`, border:`1px solid ${accentColor}30`,
                    display:'flex', alignItems:'center', justifyContent:'center',
                  }}>
                    <CheckCircle2 size={20} style={{ color: accentColor }} />
                  </div>
                  <div>
                    <div style={{ display:'flex', alignItems:'baseline', gap:10, marginBottom:4 }}>
                      <span style={{
                        fontSize:24, fontWeight:900, letterSpacing:'-1px',
                        background: gradient, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent',
                      }}>
                        {b.metric}
                      </span>
                      <span style={{ fontSize:15, fontWeight:700, color:'var(--text-primary)' }}>{b.label}</span>
                    </div>
                    <p style={{ fontSize:13, color:'var(--text-secondary)', margin:0 }}>{b.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════ 5. Metrics / KPI Cards ═════════════════════════ */
function MetricsSection({ accentColor, gradient }: { accentColor: string; gradient: string }) {
  return (
    <section style={{ padding:'88px 0', background:'var(--bg-primary)' }}>
      <div style={{ maxWidth:1100, margin:'0 auto', padding:'0 24px' }}>
        <div style={{ textAlign:'center', marginBottom:60 }}>
          <h2 style={{ fontSize:'clamp(28px, 3.5vw, 42px)', fontWeight:800, letterSpacing:'-0.8px', color:'var(--text-primary)', marginBottom:16 }}>
            Built for Performance
          </h2>
          <p style={{ color:'var(--text-secondary)', fontSize:17, maxWidth:480, margin:'0 auto' }}>
            Key performance indicators across all deployments on our platform.
          </p>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))', gap:24 }}>
          {KPI_CARDS.map(({ icon: KpiIcon, stat, label, sub }) => (
            <div
              key={label}
              style={{
                background:'var(--bg-card)', border:`1px solid ${accentColor}25`,
                borderRadius:'var(--radius-lg)', padding:'32px 24px',
                textAlign:'center', position:'relative', overflow:'hidden',
                transition:'transform 0.2s, box-shadow 0.2s',
              }}
              onMouseOver={e => { const el=e.currentTarget as HTMLElement; el.style.transform='translateY(-4px)'; el.style.boxShadow=`0 12px 40px ${accentColor}20`; }}
              onMouseOut={e  => { const el=e.currentTarget as HTMLElement; el.style.transform='translateY(0)'; el.style.boxShadow='none'; }}
            >
              <div aria-hidden style={{ position:'absolute', top:-40, right:-40, width:130, height:130, background: gradient, borderRadius:'50%', filter:'blur(50px)', opacity:0.10 }} />

              <div style={{
                width:52, height:52, borderRadius:'var(--radius-md)',
                background:`${accentColor}18`, border:`1px solid ${accentColor}30`,
                display:'flex', alignItems:'center', justifyContent:'center',
                margin:'0 auto 18px',
              }}>
                <KpiIcon size={24} style={{ color: accentColor }} />
              </div>

              <div style={{
                fontSize:'clamp(36px, 4vw, 48px)', fontWeight:900, letterSpacing:'-2px',
                background: gradient, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent',
                marginBottom:8,
              }}>
                {stat}
              </div>
              <div style={{ fontSize:16, fontWeight:700, color:'var(--text-primary)', marginBottom:6 }}>{label}</div>
              <div style={{ fontSize:13, color:'var(--text-secondary)' }}>{sub}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════ 6. CTA Section ════════════════════════════════ */
function CTASection({
  ctaTitle,
  ctaDescription,
  gradient,
  accentColor,
  slug,
}: {
  ctaTitle: string;
  ctaDescription: string;
  gradient: string;
  accentColor: string;
  slug: string;
}) {
  return (
    <section style={{ padding:'88px 0', background:'var(--bg-secondary)' }}>
      <div style={{ maxWidth:1100, margin:'0 auto', padding:'0 24px' }}>
        <div style={{
          borderRadius:'var(--radius-lg)', padding:'clamp(52px, 7vw, 80px) clamp(32px, 5vw, 80px)',
          background: gradient, position:'relative', overflow:'hidden', textAlign:'center',
        }}>
          {/* shimmer overlay */}
          <div aria-hidden style={{ position:'absolute', inset:0, background:'linear-gradient(135deg, rgba(255,255,255,0.14) 0%, transparent 55%)', pointerEvents:'none' }} />
          {/* decorative ring */}
          <div aria-hidden style={{ position:'absolute', top:'-80px', right:'-80px', width:300, height:300, border:'1px solid rgba(255,255,255,0.15)', borderRadius:'50%' }} />
          <div aria-hidden style={{ position:'absolute', bottom:'-60px', left:'-60px', width:220, height:220, border:'1px solid rgba(255,255,255,0.10)', borderRadius:'50%' }} />

          <div style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'6px 18px', borderRadius:'var(--radius-full)', background:'rgba(255,255,255,0.2)', marginBottom:24 }}>
            <Zap size={14} style={{ color:'#fff' }} />
            <span style={{ fontSize:12, fontWeight:700, color:'#fff', letterSpacing:'0.07em' }}>READY TO DEPLOY</span>
          </div>

          <h2 style={{ fontSize:'clamp(28px, 4vw, 50px)', fontWeight:900, color:'#fff', letterSpacing:'-1px', marginBottom:18, position:'relative' }}>
            {ctaTitle}
          </h2>
          <p style={{ fontSize:18, color:'rgba(255,255,255,0.84)', maxWidth:500, margin:'0 auto 44px', position:'relative', lineHeight:1.7 }}>
            {ctaDescription}
          </p>

          <div style={{ display:'flex', gap:16, justifyContent:'center', flexWrap:'wrap', position:'relative' }}>
            {/* Primary — navigates to dashboard with template param */}
            <Link
              to={`/dashboard?template=${slug}`}
              id={`cta-bottom-create-agent-${slug}`}
              style={{
                display:'inline-flex', alignItems:'center', gap:8,
                padding:'15px 34px', borderRadius:'var(--radius-md)',
                background:'#fff', color:'#0f172a', fontWeight:800, fontSize:15,
                textDecoration:'none', boxShadow:'0 4px 28px rgba(0,0,0,0.28)',
                transition:'transform 0.2s, box-shadow 0.2s',
              }}
              onMouseOver={e => { const el=e.currentTarget as HTMLElement; el.style.transform='translateY(-2px)'; el.style.boxShadow='0 8px 40px rgba(0,0,0,0.35)'; }}
              onMouseOut={e  => { const el=e.currentTarget as HTMLElement; el.style.transform='translateY(0)'; el.style.boxShadow='0 4px 28px rgba(0,0,0,0.28)'; }}
            >
              <Sparkles size={16} /> Create Agent <ArrowRight size={15} />
            </Link>

            <Link
              to="/book-appointment"
              style={{
                display:'inline-flex', alignItems:'center', gap:8,
                padding:'15px 32px', borderRadius:'var(--radius-md)',
                background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.4)',
                color:'#fff', fontWeight:700, fontSize:15, textDecoration:'none',
                transition:'background 0.2s',
              }}
              onMouseOver={e => ((e.currentTarget as HTMLElement).style.background='rgba(255,255,255,0.25)')}
              onMouseOut={e  => ((e.currentTarget as HTMLElement).style.background='rgba(255,255,255,0.15)')}
            >
              Book a Demo
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════ 7. Related Use Cases ═══════════════════════════ */
function RelatedSection({ currentSlug }: { currentSlug: string }) {
  const related = useCases.filter((uc) => uc.slug !== currentSlug).slice(0, 3);
  return (
    <section style={{ padding:'88px 0', background:'var(--bg-primary)' }}>
      <div style={{ maxWidth:1100, margin:'0 auto', padding:'0 24px' }}>
        <div style={{ textAlign:'center', marginBottom:48 }}>
          <h2 style={{ fontSize:30, fontWeight:800, letterSpacing:'-0.5px', color:'var(--text-primary)', marginBottom:12 }}>
            Explore Other Use Cases
          </h2>
          <p style={{ color:'var(--text-secondary)', fontSize:16 }}>
            Discover how AI voice agents can power every part of your business.
          </p>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(300px, 1fr))', gap:22 }}>
          {related.map((uc) => (
            <Link
              key={uc.slug}
              to={`/use-cases/${uc.slug}`}
              id={`related-${uc.slug}`}
              style={{
                display:'flex', alignItems:'flex-start', gap:18, padding:'24px',
                background:'var(--bg-card)', border:'1px solid var(--border)',
                borderRadius:'var(--radius-lg)', textDecoration:'none',
                transition:'border-color 0.22s, transform 0.22s, box-shadow 0.22s',
              }}
              onMouseOver={e => { const el=e.currentTarget as HTMLElement; el.style.borderColor=`${uc.accentColor}80`; el.style.transform='translateY(-4px)'; el.style.boxShadow=`0 10px 36px ${uc.accentColor}18`; }}
              onMouseOut={e  => { const el=e.currentTarget as HTMLElement; el.style.borderColor='var(--border)'; el.style.transform='translateY(0)'; el.style.boxShadow='none'; }}
            >
              <div style={{
                width:48, height:48, borderRadius:'var(--radius-md)', flexShrink:0,
                background:`${uc.accentColor}18`, border:`1px solid ${uc.accentColor}30`,
                display:'flex', alignItems:'center', justifyContent:'center',
              }}>
                <uc.icon size={22} style={{ color: uc.accentColor }} />
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:16, fontWeight:700, color:'var(--text-primary)', marginBottom:6 }}>{uc.title}</div>
                <div style={{ fontSize:13, color:'var(--text-secondary)', lineHeight:1.55 }}>{uc.subtitle.split('—')[0].trim()}</div>
                <div style={{ display:'inline-flex', alignItems:'center', gap:5, marginTop:12, fontSize:13, fontWeight:600, color: uc.accentColor }}>
                  Learn more <ArrowRight size={13} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════ Main Page ═════════════════════════════════ */

export default function UseCasePage() {
  const { slug } = useParams<{ slug: string }>();
  const useCase = getUseCaseBySlug(slug ?? '');

  /* ── SEO: update title + meta description without react-helmet ── */
  useEffect(() => {
    if (!useCase) return;
    const prev = document.title;
    document.title = `${useCase.title} | AI Voice Agent — OmniDimension`;

    let metaDesc = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const prevContent = metaDesc?.content ?? '';
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.name = 'description';
      document.head.appendChild(metaDesc);
    }
    metaDesc.content = useCase.heroDescription;

    return () => {
      document.title = prev;
      if (metaDesc) metaDesc.content = prevContent;
    };
  }, [useCase]);

  if (!useCase) return <UseCaseNotFound />;

  const {
    heroHeading, heroDescription, subtitle, icon, gradient, accentColor,
    features, workflowSteps, benefits, ctaTitle, ctaDescription,
  } = useCase;

  return (
    <main style={{ fontFamily:'var(--font-main)', color:'var(--text-primary)' }}>
      <HeroSection
        heroHeading={heroHeading}
        heroDescription={heroDescription}
        subtitle={subtitle}
        gradient={gradient}
        accentColor={accentColor}
        icon={icon}
        slug={slug ?? ''}
      />
      <FeaturesSection features={features} accentColor={accentColor} />
      <WorkflowSection steps={workflowSteps} accentColor={accentColor} gradient={gradient} />
      <BenefitsSection benefits={benefits} accentColor={accentColor} gradient={gradient} />
      <MetricsSection accentColor={accentColor} gradient={gradient} />
      <CTASection
        ctaTitle={ctaTitle}
        ctaDescription={ctaDescription}
        gradient={gradient}
        accentColor={accentColor}
        slug={slug ?? ''}
      />
      <RelatedSection currentSlug={slug ?? ''} />
    </main>
  );
}
