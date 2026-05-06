import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Languages, ArrowUpRight, PhoneIncoming, Plug, Wand2, Phone, PenLine, FlaskConical, Puzzle, Rocket, LineChart, ChevronUp, ChevronDown, MessageSquare, MousePointer2, Layers, Users, Activity, Database, Code, Link2, Zap, PhoneCall, BarChart2, FileText, Star, ArrowRight, ArrowDown } from 'lucide-react';

export default function Home() {
  const [activeUseCase, setActiveUseCase] = useState('');
  const [promptText, setPromptText] = useState('');
  const [activeFaq, setActiveFaq] = useState<number | null>(null);
  const [activeStep, setActiveStep] = useState(0);


  const useCases = {
    'Lead Generation': 'Create a voice AI assistant that qualifies leads, collects contact information, and schedules follow-up calls automatically.',
    'Appointments': 'Create a voice AI assistant that handles appointment booking for a medical clinic and sends confirmations.',
    'Support': 'Create a voice AI assistant that handles customer support, answers FAQs, and escalates complex issues to human agents.',
    'Negotiation': 'Create a voice AI assistant that can negotiate payment plans and settlements with customers.',
    'Collections': 'Create a voice AI assistant for debt collection that handles payment reminders and arrangements.'
  };

  const handleUseCaseClick = (useCase: keyof typeof useCases) => {
    setActiveUseCase(useCase);
    setPromptText(useCases[useCase]);
  };

  const toggleFaq = (index: number) => {
    setActiveFaq(activeFaq === index ? null : index);
  };
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          (entry.target as HTMLElement).style.opacity = '1';
          (entry.target as HTMLElement).style.transform = 'translateY(0)';
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });

    document.querySelectorAll('.animate-me').forEach(el => {
      (el as HTMLElement).style.opacity = '0';
      (el as HTMLElement).style.transform = 'translateY(24px)';
      (el as HTMLElement).style.transition = 'opacity 0.5s ease, transform 0.5s ease';
      observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  const howItWorksData = [
    {
      id: 1, title: 'Write', desc: 'Describe what type of Voice AI assistant you want', icon: PenLine,
      paneTitle: 'Create Voice AI Assistants with Natural Language', paneDesc: "Simply describe what you want your Voice AI assistant to do, and we'll build it for you.",
      features: [
        { icon: MessageSquare, title: 'Conversational Creation', desc: 'Build your assistant through natural conversation - just chat with our platform about what you need.' },
        { icon: MousePointer2, title: 'Drag-and-Drop Interface', desc: 'Fine-tune your assistant\'s capabilities with our intuitive drag-and-drop editor.' },
        { icon: Layers, title: 'Pre-built Templates', desc: 'Start with industry-specific templates and customize to your needs.' }
      ]
    },
    {
      id: 2, title: 'Test', desc: 'Try out your assistant and see how it performs', icon: FlaskConical,
      paneTitle: 'Test Your Assistant in Real Scenarios', paneDesc: 'Ensure your Voice AI assistant performs perfectly before deployment.',
      features: [
        { icon: MessageSquare, title: 'Test by chatting with the assistant', desc: 'Interact directly with your assistant to see how it handles conversations in real-time.' },
        { icon: Users, title: 'Simulate 1000+ scenarios', desc: 'Automatically test your assistant against thousands of potential user interactions.' },
        { icon: Activity, title: 'Evaluate performance', desc: 'Measure accuracy, response time, and user satisfaction with comprehensive metrics.' }
      ]
    },
    {
      id: 3, title: 'Add Functionalities', desc: 'Enhance through chat and drag-and-drop', icon: Puzzle,
      paneTitle: "Extend Your Agent's Capabilities", paneDesc: 'Add powerful features to make your Voice AI assistant even more capable.',
      features: [
        { icon: Layers, title: 'Enhance your assistant from our node library', desc: 'Add pre-built capabilities from our extensive library of functional nodes.' },
        { icon: Database, title: 'Add Knowledgebase', desc: 'Connect your assistant to your documentation, FAQs, and other knowledge sources.' },
        { icon: Code, title: 'Integration marketplace', desc: 'Connect to CRMs, calendars, payment systems, and other business tools.' },
        { icon: Link2, title: 'Add Tooling through API calls', desc: "Extend your assistant's capabilities by connecting to external APIs and services." }
      ]
    },
    {
      id: 4, title: 'Deploy', desc: 'Make your assistant available to your users', icon: Rocket,
      paneTitle: 'Go Live with One Click', paneDesc: 'Deploy your Voice AI assistant to production environments instantly.',
      features: [
        { icon: Zap, title: 'Instant Deployment', desc: 'Push your assistant live with a single click - no technical setup required.' },
        { icon: PhoneCall, title: 'Purchase phone numbers', desc: 'Get dedicated phone numbers for your assistant in multiple countries and regions.' },
        { icon: Activity, title: 'Scalable Infrastructure', desc: 'Handle thousands of simultaneous conversations with enterprise-grade reliability.' }
      ]
    },
    {
      id: 5, title: 'Observe & Monitor', desc: 'Track performance and make improvements', icon: LineChart,
      paneTitle: 'Gain Insights and Continuously Improve', paneDesc: "Monitor your Voice AI assistant's performance and optimize based on real data.",
      features: [
        { icon: BarChart2, title: 'Analytics Dashboard', desc: 'Track key metrics like call volume, resolution rates, and user satisfaction.' },
        { icon: FileText, title: 'Logs and Traces', desc: 'Get interaction and span level overview of how your assistant is performing in real-time.' },
        { icon: Star, title: 'Define Conversation Quality Scores', desc: "Create custom metrics to evaluate and improve your assistant's conversation quality." }
      ]
    }
  ];

  return (
    <>
      
      {/* Hero Section */}
      <section className="hero">
        <div className="container">
          <h1 className="hero-title">
            <span style={{fontWeight: 700}}>Create your</span> <em style={{fontStyle: 'italic', fontWeight: 'normal'}}>Free</em> <span style={{color:'var(--teal)'}}>Voice AI</span> <span style={{fontWeight: 700}}>Assistant</span>
          </h1>
          <p className="hero-subtitle">Build, test, and ship reliable voice AI assistants</p>
          
          <div className="hero-input-wrapper">
            <textarea 
              className="hero-input" 
              placeholder="Create a voice AI assistant that handles new membership applications at a gym"
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
            />
            <div className="hero-input-footer">
              <label style={{display:'flex', alignItems:'center', gap:'8px', fontSize:'13px', color:'var(--text-secondary)', cursor:'pointer'}}>
                <input type="checkbox" className="custom-checkbox" defaultChecked />
                Guided Flow
              </label>
              <Link to="/dashboard" className="btn" style={{backgroundColor: '#1a3a4a', color: 'white'}}>Create Agent →</Link>
            </div>
          </div>
          
          <div className="use-case-row">
            <span style={{color:'var(--text-secondary)', fontSize:'14px'}}>Choose from use cases</span>
            <div className="use-case-chips">
              {(Object.keys(useCases) as Array<keyof typeof useCases>).map(useCase => (
                <button 
                  key={useCase} 
                  className={`chip ${activeUseCase === useCase ? 'active' : ''}`}
                  onClick={() => handleUseCaseClick(useCase)}
                >
                  {useCase}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Trusted By */}
      <section className="trusted-by" style={{marginTop:'50px'}}>
        <div className="container" style={{textAlign:'center'}}>
          <p style={{color:'var(--text-secondary)', fontSize:'14px', marginBottom:'32px', fontWeight:400}}>
            Trusted by leading companies
          </p>
          <div className="trusted-logos">
            <div className="trusted-logo-item">
              <img src="https://upload.wikimedia.org/wikipedia/commons/9/9d/Capgemini_201x_logo.svg" alt="Capgemini" style={{height: '26px', filter: 'brightness(0) saturate(100%) invert(56%) sepia(61%) saturate(2335%) hue-rotate(164deg) brightness(98%) contrast(98%)'}} />
            </div>
            <div className="trusted-logo-item">
              <img src="/logos/exotel.jpg" alt="exotel" style={{height: '32px', mixBlendMode: 'screen', filter: 'contrast(10) brightness(0.6)'}} />
            </div>
            <div className="trusted-logo-item" style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
              <img src="/logos/nvidia.png" alt="NVIDIA" style={{height: '48px', mixBlendMode: 'screen', filter: 'contrast(10) brightness(0.6)'}} />
              <div style={{borderLeft: '1px solid #444', paddingLeft: '12px', display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
                <span style={{color: 'white', fontSize: '12px', fontWeight: '700', lineHeight:'1.2'}}>Inception</span>
                <span style={{color: 'white', fontSize: '12px', fontWeight: '700', lineHeight:'1.2'}}>Program</span>
              </div>
            </div>
            <div className="trusted-logo-item">
              <img src="/logos/mg.png" alt="MG" style={{height: '54px', mixBlendMode: 'screen', filter: 'grayscale(1) invert(1) brightness(2.5) sepia(1) saturate(10000%) hue-rotate(345deg)'}} />
            </div>
            <div className="trusted-logo-item">
              <img src="/logos/cipla.jpg" alt="Cipla" style={{height: '42px', mixBlendMode: 'screen', filter: 'grayscale(1) invert(1) brightness(2.5) sepia(1) saturate(10000%) hue-rotate(200deg)'}} />
            </div>
          </div>
        </div>
      </section>

      {/* Features Outline */}
      <section style={{ position: 'relative', padding: '100px 0', overflow: 'hidden' }}>
        <div className="ambient-glow top-left" />
        <div className="ambient-glow bottom-right" />
        
        <div className="container" style={{ position: 'relative', zIndex: 1, maxWidth: '1100px' }}>
          <div style={{ textAlign: 'center', marginBottom: '60px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span style={{ color: '#0eb39e', border: '1px solid rgba(14,179,158,0.3)', background: 'rgba(14,179,158,0.05)', padding: '6px 16px', borderRadius: '24px', fontSize: '14px', fontWeight: '500', marginBottom: '24px', display: 'inline-block' }}>Core Capabilities</span>
            <h2 style={{ fontSize: '42px', fontWeight: '700', margin: '0 0 16px', letterSpacing: '-0.5px' }}>Why OmniDimension for <span style={{ color: '#0eb39e' }}>Voice AI</span> ?</h2>
            <p style={{ color: '#888', fontSize: '18px', margin: 0 }}>Powerful features to build, deploy, and scale your Voice AI assistants</p>
          </div>

          <div className="features-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px' }}>
            <div className="core-feature-card animate-me">
              <div className="core-feature-icon-wrapper">
                <Languages size={24} />
              </div>
              <h3>Multi-Language</h3>
              <p>Serve users in हिंदी, தமிழ், Español, 日本語, and more</p>
            </div>
            <div className="core-feature-card animate-me">
              <div className="core-feature-icon-wrapper">
                <ArrowUpRight size={24} />
              </div>
              <h3>Scale Outbound</h3>
              <p>Automate lead gen, reminders & collections</p>
            </div>
            <div className="core-feature-card animate-me">
              <div className="core-feature-icon-wrapper">
                <PhoneIncoming size={24} />
              </div>
              <h3>24/7 Inbound</h3>
              <p>Handle bookings and inquiries around the clock</p>
            </div>
            <div className="core-feature-card animate-me">
              <div className="core-feature-icon-wrapper">
                <Plug size={24} />
              </div>
              <h3>Connect Stack</h3>
              <p>Integrate with CRM, Sheets, Slack, n8n</p>
            </div>
            <div className="core-feature-card animate-me">
              <div className="core-feature-icon-wrapper">
                <Wand2 size={24} />
              </div>
              <h3>Quick Training</h3>
              <p>Train AI with your own call recordings</p>
            </div>
            <div className="core-feature-card animate-me">
              <div className="core-feature-icon-wrapper">
                <Phone size={24} />
              </div>
              <h3>Phone Numbers</h3>
              <p>Buy Indian (+91) or US (+1) numbers instantly</p>
            </div>
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section style={{ padding: '100px 0', borderTop: '1px solid var(--border)', background: 'radial-gradient(ellipse at bottom, rgba(14, 179, 158, 0.03) 0%, transparent 60%)' }}>
        <div className="container" style={{ maxWidth: '1200px' }}>
          <div style={{ textAlign: 'center', marginBottom: '60px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span style={{ color: '#0eb39e', border: '1px solid rgba(14,179,158,0.3)', background: 'rgba(14,179,158,0.05)', padding: '6px 16px', borderRadius: '24px', fontSize: '14px', fontWeight: '500', marginBottom: '24px', display: 'inline-block' }}>Simple Process</span>
            <h2 style={{ fontSize: '42px', fontWeight: '700', margin: '0 0 16px', letterSpacing: '-0.5px' }}>How it Works</h2>
            <p style={{ color: '#888', fontSize: '18px', margin: 0 }}>Create and deploy your Voice AI assistant in five simple steps</p>
          </div>

          {/* Steps Horizontal List */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px', marginBottom: '32px' }}>
            {howItWorksData.map((step, idx) => {
               const isActive = activeStep === idx;
               return (
                 <div key={idx} className="how-it-works-step" onClick={() => setActiveStep(idx)} style={{ 
                   background: '#050505', 
                   border: `1px solid ${isActive ? 'var(--teal)' : 'var(--border)'}`, 
                   borderRadius: '16px', 
                   padding: '32px 24px',
                   display: 'flex',
                   flexDirection: 'column',
                   alignItems: 'center',
                   textAlign: 'center',
                   position: 'relative',
                   transition: 'all 0.3s',
                   cursor: 'pointer'
                 }}>
                   <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#0a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--teal)', fontSize: '16px', fontWeight: '700', marginBottom: '16px' }}>
                     {step.id}
                   </div>
                   <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#0a111a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--teal)', marginBottom: '24px', border: '1px solid rgba(255,255,255,0.03)' }}>
                     <step.icon size={22} />
                   </div>
                   <h4 style={{ fontSize: '18px', fontWeight: '700', color: 'white', marginBottom: '12px' }}>{step.title}</h4>
                   <p style={{ fontSize: '13px', color: '#888', lineHeight: '1.5', margin: 0, padding: '0 8px' }}>{step.desc}</p>
                   
                   <div style={{ position: 'absolute', bottom: '16px', color: 'var(--teal)' }}>
                     {isActive ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                   </div>
                 </div>
               );
             })}
          </div>

          {/* Active Step Detailed Pane */}
          <div style={{ background: '#080c14', border: '1px solid var(--border)', borderRadius: '16px', padding: '48px' }}>
            <h3 style={{ fontSize: '24px', fontWeight: '700', color: 'white', marginBottom: '8px' }}>{howItWorksData[activeStep].paneTitle}</h3>
            <p style={{ color: '#888', fontSize: '15px', marginBottom: '40px' }}>{howItWorksData[activeStep].paneDesc}</p>

            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${howItWorksData[activeStep].features.length}, 1fr)`, gap: '24px' }}>
              {howItWorksData[activeStep].features.map((feat, fidx) => (
                <div key={fidx} style={{ background: '#050505', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                    <feat.icon size={20} style={{ color: 'var(--teal)' }} />
                    <h5 style={{ color: 'white', fontSize: '16px', fontWeight: '600', margin: 0 }}>{feat.title}</h5>
                  </div>
                  <p style={{ color: '#888', fontSize: '14px', lineHeight: '1.6', margin: 0 }}>{feat.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Try It Out CTA */}
      <section style={{background:'var(--bg-card)', padding:'80px 0', borderTop:'1px solid var(--border)', borderBottom:'1px solid var(--border)'}}>
        <div className="container" style={{textAlign:'center'}}>
           <h2>Start building your voice agent today</h2>
           <p style={{color:'var(--text-secondary)', marginBottom:'32px', maxWidth:'600px', margin:'0 auto 32px'}}>
             Join thousands of developers building the next generation of conversational AI.
           </p>
           <div style={{display:'flex', gap:'16px', justifyContent:'center'}}>
             <Link to="/dashboard" className="btn btn-primary btn-lg">Start for Free →</Link>
             <Link to="/book-appointment" className="btn btn-secondary btn-lg">Book a Demo</Link>
           </div>
        </div>
      </section>

      {/* Integrations & Partners */}
      <section style={{ position: 'relative', padding: '100px 0', overflow: 'hidden' }}>
        {/* Ambient teal glow behind the box */}
        <div style={{
          position: 'absolute', top: '10%', left: '50%', transform: 'translateX(-50%)',
          width: '700px', height: '300px',
          background: 'radial-gradient(ellipse, rgba(14,179,158,0.18) 0%, rgba(14,179,158,0.05) 50%, transparent 80%)',
          filter: 'blur(30px)', zIndex: 0, pointerEvents: 'none'
        }} />

        <div className="container" style={{ position: 'relative', zIndex: 1, maxWidth: '1100px' }}>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: '48px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span style={{ color: '#0eb39e', border: '1px solid rgba(14,179,158,0.3)', background: 'rgba(14,179,158,0.06)', padding: '6px 16px', borderRadius: '24px', fontSize: '14px', fontWeight: '500', marginBottom: '24px', display: 'inline-block' }}>Ecosystem</span>
            <h2 style={{ fontSize: '40px', fontWeight: '700', margin: '0 0 16px', letterSpacing: '-0.5px' }}>Integrations and Partners</h2>
            <p style={{ color: '#888', fontSize: '17px', maxWidth: '520px', margin: 0, lineHeight: '1.6' }}>Connect with your favorite tools and platforms. Powered by industry-leading technologies and partnerships.</p>
          </div>

          {/* Integration Card */}
          <div style={{
            background: '#060a0f',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: '20px',
            padding: '0',
            position: 'relative',
            overflow: 'hidden',
            height: '340px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            {/* Inner subtle gradient */}
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center, rgba(14,179,158,0.04) 0%, transparent 65%)', pointerEvents: 'none' }} />

            {/* CENTER: OmniDimension Logo Text */}
            <div style={{ textAlign: 'center', zIndex: 5 }}>
              <span style={{ fontSize: '28px', fontWeight: '700', color: 'white', letterSpacing: '-1px', fontFamily: 'Space Grotesk, sans-serif' }}>
                OMNI<span style={{ color: '#0eb39e' }}>D</span>IMENSION
              </span>
            </div>

            {/* LEFT LOGOS — absolutely positioned, scattered */}
            {/* Cal */}
            <div style={{ position: 'absolute', top: '14%', left: '5%' }}>
              <div style={{ width: '52px', height: '52px', background: '#1a1a1a', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #222', fontSize: '13px', fontWeight: '700', color: 'white' }}>Cal</div>
            </div>
            {/* Purple M — Make/Integromat */}
            <div style={{ position: 'absolute', top: '8%', left: '17%' }}>
              <div style={{ width: '52px', height: '52px', background: '#6c17c9', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', fontWeight: '900', color: 'white' }}>m</div>
            </div>
            {/* ChatGPT / OpenAI */}
            <div style={{ position: 'absolute', top: '30%', left: '5%' }}>
              <div style={{ width: '52px', height: '52px', background: '#10a37f', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="white"><path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.8956zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z"/></svg>
              </div>
            </div>
            {/* Google Calendar */}
            <div style={{ position: 'absolute', top: '50%', left: '12%', transform: 'translateY(-50%)' }}>
              <div style={{ width: '52px', height: '52px', background: '#fff', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '700', color: '#1a73e8', border: '2px solid #e0e0e0' }}>31</div>
            </div>
            {/* Gmail */}
            <div style={{ position: 'absolute', top: '68%', left: '5%' }}>
              <div style={{ width: '52px', height: '52px', background: '#fff', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg viewBox="0 0 24 24" width="32" height="32"><path fill="#EA4335" d="M1 5.5L12 13l11-7.5V18a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V5.5z"/><path fill="#FBBC05" d="M1 5.5L12 13l11-7.5"/><path fill="#34A853" d="M23 5.5V18a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V5.5l11 7.5 11-7.5z" opacity="0"/><path fill="#4285F4" d="M1 5.5A1 1 0 0 1 2 4.5h20a1 1 0 0 1 1 1L12 13 1 5.5z"/></svg>
              </div>
            </div>
            {/* Mailchimp */}
            <div style={{ position: 'absolute', top: '72%', left: '18%' }}>
              <div style={{ width: '52px', height: '52px', background: '#FFE01B', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>🐒</div>
            </div>
            {/* Slack */}
            <div style={{ position: 'absolute', top: '62%', left: '26%' }}>
              <div style={{ width: '52px', height: '52px', background: '#4A154B', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg viewBox="0 0 24 24" width="30" height="30" fill="white"><path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zm2.521-10.123a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.122 2.521a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.268 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zm-2.523 10.122a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.268a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/></svg>
              </div>
            </div>
            {/* Anthropic / AI */}
            <div style={{ position: 'absolute', top: '80%', left: '5%' }}>
              <div style={{ width: '52px', height: '52px', background: '#CC785C', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '800', color: 'white' }}>AI</div>
            </div>
            {/* Globe */}
            <div style={{ position: 'absolute', top: '22%', left: '30%' }}>
              <div style={{ width: '52px', height: '52px', background: '#1a2a3a', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '26px' }}>🌐</div>
            </div>
            {/* n8n / flow S */}
            <div style={{ position: 'absolute', top: '55%', left: '33%' }}>
              <div style={{ width: '52px', height: '52px', background: '#ea4b71', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', fontWeight: '900', color: 'white' }}>n</div>
            </div>

            {/* RIGHT LOGOS */}
            {/* Growth arrow */}
            <div style={{ position: 'absolute', top: '6%', right: '4%' }}>
              <div style={{ width: '52px', height: '52px', background: '#1a2a1a', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '26px' }}>📈</div>
            </div>
            {/* Flow/scatter nodes */}
            <div style={{ position: 'absolute', top: '18%', right: '18%' }}>
              <div style={{ width: '52px', height: '52px', background: '#1a1a2a', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', color: '#e91e8c' }}>⋯</div>
            </div>
            {/* Trello */}
            <div style={{ position: 'absolute', top: '28%', right: '7%' }}>
              <div style={{ width: '52px', height: '52px', background: '#0052CC', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg viewBox="0 0 24 24" width="28" height="28" fill="white"><path d="M21 0H3C1.343 0 0 1.343 0 3v18c0 1.656 1.343 3 3 3h18c1.656 0 3-1.344 3-3V3c0-1.657-1.344-3-3-3zM10.44 18.18c0 .795-.645 1.44-1.44 1.44H4.56c-.795 0-1.44-.645-1.44-1.44V4.56c0-.795.645-1.44 1.44-1.44H9c.795 0 1.44.645 1.44 1.44v13.62zm10.44-6c0 .794-.645 1.44-1.44 1.44H15c-.795 0-1.44-.646-1.44-1.44V4.56c0-.795.645-1.44 1.44-1.44h4.44c.795 0 1.44.645 1.44 1.44v7.62z"/></svg>
              </div>
            </div>
            {/* Salesforce */}
            <div style={{ position: 'absolute', top: '45%', right: '16%' }}>
              <div style={{ width: '72px', height: '36px', background: '#00A1E0', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700', color: 'white' }}>salesforce</div>
            </div>
            {/* Twilio / Tokbox red */}
            <div style={{ position: 'absolute', top: '38%', right: '4%' }}>
              <div style={{ width: '52px', height: '52px', background: '#F22F46', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg viewBox="0 0 24 24" width="28" height="28" fill="white"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 2a9.994 9.994 0 0 1 7.072 2.929A9.995 9.995 0 0 1 22 12c0 5.523-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2zm-3 7a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm-6 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/></svg>
              </div>
            </div>
            {/* Google Sheets */}
            <div style={{ position: 'absolute', top: '58%', right: '5%' }}>
              <div style={{ width: '52px', height: '52px', background: '#0F9D58', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg viewBox="0 0 24 24" width="28" height="28" fill="white"><path d="M11.318 12.545H7.91v-1.909h3.41v1.91zm0 3.273H7.91v-1.91h3.41v1.91zm1.364-3.273v-1.909h3.41v1.91h-3.41zm0 3.273v-1.91h3.41v1.91h-3.41zM6.545 9.273H17.46v7.09H6.545v-7.09zM14.727 3l4.91 4.91H14.727V3zM6 0v24h12V7.636L13.364 0H6z"/></svg>
              </div>
            </div>
            {/* Asterisk/HubSpot */}
            <div style={{ position: 'absolute', top: '72%', right: '18%' }}>
              <div style={{ width: '52px', height: '52px', background: '#FF7A59', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '26px', color: 'white', fontWeight: '900' }}>✺</div>
            </div>
            {/* HubSpot */}
            <div style={{ position: 'absolute', top: '72%', right: '8%' }}>
              <div style={{ width: '52px', height: '52px', background: '#FF7A59', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px' }}>🔗</div>
            </div>
            {/* Zoho */}
            <div style={{ position: 'absolute', top: '78%', right: '3%' }}>
              <div style={{ width: '52px', height: '52px', background: '#e42527', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '800', color: 'white', letterSpacing: '-0.5px' }}>ZOHO</div>
            </div>
            {/* Zapier lightning */}
            <div style={{ position: 'absolute', top: '55%', right: '28%' }}>
              <div style={{ width: '52px', height: '52px', background: '#FF4A00', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '26px', color: 'white' }}>⚡</div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="container" style={{padding:'100px 0', maxWidth:'900px', margin:'0 auto'}} id="faq">
        <div style={{textAlign: 'center', marginBottom: '60px'}}>
          <h2 style={{fontSize: '36px', fontWeight: '700', marginBottom: '16px'}}>Frequently Asked Questions</h2>
          <p style={{color: '#888', fontSize: '18px'}}>Common questions about the OmniDimension platform</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {[
            {q: "How quickly can I really create a Voice AI agent?", a: "You can create a fully functional Voice AI agent on OmniDimension in under 5 minutes. Just prompt, pick a voice, and launch. No coding required."},
            {q: "Do I need any technical or coding knowledge?", a: "Not at all. OmniDimension is built for everyone, from business owners to developers. You can create, test, and deploy AI agents without writing a single line of code."},
            {q: "What kind of Voice AI agents can I build?", a: "On OmniDimension, you can build customer support bots, lead generation agents, appointment schedulers, sales assistants, IVR systems, and more. If your business talks to customers, you can automate it here."},
            {q: "Can I customize how the AI agent sounds and responds?", a: "Absolutely. OmniDimension lets you choose from a variety of natural voices, tones, speaking speeds, and emotional styles. You can also edit the agent’s conversation flow and personality to match your brand."},
            {q: "What happens after I create my agent?", a: "Once created on OmniDimension, you can instantly test your agent, deploy it on calls or your website, and track live analytics on performance and user engagement."},
            {q: "Is there a free trial or demo available?", a: "Yes. You can sign up for a free trial on OmniDimension to create your first agent and experience the platform before upgrading to a paid plan."},
            {q: "Can I integrate my AI agent with existing systems?", a: "Yes. OmniDimension integrates seamlessly with CRMs, call management tools, APIs, and databases, allowing you to personalize conversations and automate workflows."},
            {q: "How does the AI handle multiple conversations at once?", a: "OmniDimension is cloud-based and scalable. Your agents can handle thousands of simultaneous calls or chats without lag or downtime."},
            {q: "Can the AI agent make outbound calls?", a: "Yes. On OmniDimension, you can run bulk or targeted outbound call campaigns for sales, follow-ups, or surveys, complete with detailed analytics on performance."},
            {q: "Can I train the AI on my company data?", a: "Yes. You can upload FAQs, documents, or scripts on OmniDimension, and the AI will learn to respond using your brand’s tone and knowledge base."},
            {q: "What happens if the AI doesn’t understand something?", a: "When your OmniDimension agent encounters unclear inputs, it can either ask clarifying questions or transfer the conversation to a human operator, depending on your configuration."},
            {q: "Can I use my own phone number for calls?", a: "Yes. OmniDimension lets you connect your existing business number or purchase a new one for inbound and outbound calls."},
            {q: "Can I monitor my AI agents in real time?", a: "Yes. OmniDimension provides real-time dashboards with live call logs, transcripts, sentiment analysis, and detailed performance reports."},
            {q: "How much does it cost to use the platform?", a: "OmniDimension uses a flexible, usage-based pricing model. You pay for minutes used. Volume discounts and enterprise plans are also available."},
            {q: "How do I measure the success of my AI agent?", a: "OmniDimension provides detailed reports showing call outcomes, engagement rates, sentiment analysis, and lead conversion, all accessible from your dashboard."},
            {q: "Can I pause or edit an agent after it’s live?", a: "Yes. On OmniDimension, you can modify scripts, change voices, or pause campaigns anytime without losing your progress or data."},
            {q: "What is the latency on OmniDimension calls?", a: "OmniDimension maintains low latency, typically under 500 milliseconds, ensuring that every response from your AI agent feels instant and natural. This near real-time performance makes conversations fluid and human-like, even in high-volume campaigns."},
            {q: "Can I make bulk calls or outgoing calls?", a: "Yes. You can easily make bulk or outbound calls directly through OmniDimension. The platform supports large-scale automated calling for sales, surveys, reminders, and customer engagement, all powered by AI-driven personalization and real-time analytics."},
            {q: "I have my own telephony, can I use it with OmniDimension?", a: "Absolutely. OmniDimension supports SIP (Session Initiation Protocol) integration, allowing you to connect your existing telephony or PBX system seamlessly. This gives you full control over routing, carrier preferences, and infrastructure while leveraging OmniDimension’s AI capabilities."}
          ].map((faq, i) => (
            <div 
              key={i} 
              style={{ 
                background: '#050505', 
                border: `1px solid ${activeFaq === i ? 'var(--teal)' : 'rgba(255,255,255,0.05)'}`, 
                borderRadius: '8px', 
                overflow: 'hidden',
                transition: 'all 0.3s'
              }}
            >
              <button 
                onClick={() => toggleFaq(i)}
                style={{
                  width: '100%',
                  padding: '24px 28px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'transparent',
                  border: 'none',
                  color: 'white',
                  cursor: 'pointer',
                  textAlign: 'left'
                }}
              >
                <span style={{ fontSize: '16px', fontWeight: 'bold' }}>{faq.q}</span>
                {activeFaq === i 
                  ? <ArrowDown size={20} style={{ color: 'var(--teal)', minWidth: '20px' }} /> 
                  : <ArrowRight size={20} style={{ color: 'var(--teal)', minWidth: '20px' }} />
                }
              </button>
              
              {activeFaq === i && (
                <div style={{ padding: '0 28px 24px 28px' }}>
                  <p style={{ color: '#888', fontSize: '15px', lineHeight: '1.6', margin: 0 }}>{faq.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
      
      {/* Ask Kevin Chat Bubble */}
      <div style={{position:'fixed', bottom:'24px', right:'24px', display: 'flex', alignItems: 'center', gap: '12px', zIndex:100}}>
        <div style={{fontWeight:600, fontSize:'14px', color:'white', background:'rgba(0,0,0,0.4)', padding:'6px 12px', borderRadius:'16px', backdropFilter:'blur(4px)'}}>
          Ask Kevin
        </div>
        <div style={{background:'#0e1a2b', width:'48px', height:'48px', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', boxShadow:'0 8px 30px rgba(0,0,0,0.6)', border:'1px solid rgba(255,255,255,0.05)'}}>
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M8 6h3.5C14.5 6 17 8.5 17 11s-2.5 5-5.5 5H8V6z" fill="white"/>
          </svg>
        </div>
      </div>
    </>
  );
}
