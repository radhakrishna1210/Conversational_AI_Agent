import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import AnnouncementBar from '../components/AnnouncementBar';

export default function Home() {
  const [activeUseCase, setActiveUseCase] = useState('Lead Generation');
  const [promptText, setPromptText] = useState(
    'Create a custom AI assistant that handles your membership applications...'
  );
  const [activeFaq, setActiveFaq] = useState<number | null>(null);

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

  return (
    <>
      <AnnouncementBar />
      
      {/* Hero Section */}
      <section className="hero">
        <div className="container">
          <div className="badge">1.70.0 is live →</div>
          <h1 className="hero-title">
            Create your <span style={{color:'var(--teal)'}}>Free</span> Voice AI Assistant
          </h1>
          <p className="hero-subtitle">Build, test, and ship reliable voice AI assistants</p>
          
          <div className="hero-input-wrapper">
            <textarea 
              className="hero-input" 
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
            />
            <div className="hero-input-footer">
              <label style={{display:'flex', alignItems:'center', gap:'8px', fontSize:'13px', color:'var(--text-secondary)', cursor:'pointer'}}>
                <input type="checkbox" defaultChecked style={{accentColor:'var(--teal)'}} />
                Guided Flow
              </label>
              <Link to="/dashboard" className="btn btn-primary">Create Agent →</Link>
            </div>
          </div>
          
          <div className="use-case-row">
            <span style={{color:'var(--text-secondary)', fontSize:'14px'}}>Choose from use cases:</span>
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
      </section>

      {/* Trusted By */}
      <section className="trusted-by" style={{marginTop:'50px'}}>
        <div className="container" style={{textAlign:'center'}}>
          <p style={{color:'var(--text-secondary)', fontSize:'14px', marginBottom:'24px', fontWeight:500}}>
            TRUSTED BY THE BEST TEAMS
          </p>
          <div className="trusted-logos">
            <div className="trusted-logo">OpenAI</div>
            <div className="trusted-logo">Salesforce</div>
            <div className="trusted-logo">Twilio</div>
            <div className="trusted-logo">Zendesk</div>
            <div className="trusted-logo">HubSpot</div>
            <div className="trusted-logo">Stripe</div>
          </div>
        </div>
      </section>

      {/* Features Outline */}
      <section className="container" style={{padding:'80px 0'}}>
        <div className="section-header">
          <h2>Core Capabilities</h2>
          <p>Everything you need to build production-ready voice AI.</p>
        </div>
        <div className="features-grid">
          <div className="feature-card animate-me">
            <div className="feature-icon">⚡</div>
            <h3>Sub-500ms Latency</h3>
            <p>Experience ultra-low latency conversations that feel completely natural and human-like.</p>
          </div>
          <div className="feature-card animate-me">
            <div className="feature-icon">1k+</div>
            <h3>1000+ Voices</h3>
            <p>Choose from an extensive library of high-quality HD, ultra-realistic AI voices.</p>
          </div>
          <div className="feature-card animate-me">
            <div className="feature-icon">🌐</div>
            <h3>90+ Languages</h3>
            <p>Deploy globally with comprehensive multi-language support and real-time translation.</p>
          </div>
          <div className="feature-card animate-me">
            <div className="feature-icon">🧠</div>
            <h3>Custom Knowledge</h3>
            <p>Train your agents on your own documents, pricing tables, and business logic.</p>
          </div>
          <div className="feature-card animate-me">
            <div className="feature-icon">🔌</div>
            <h3>Tool Calling</h3>
            <p>Equip your assistants with APIs to check inventory, book meetings, or process payments.</p>
          </div>
          <div className="feature-card animate-me">
            <div className="feature-icon">📞</div>
            <h3>Bring Your Number</h3>
            <p>Connect your existing SIP trunk or buy a new number directly from our dashboard.</p>
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

      {/* FAQ */}
      <section className="container" style={{padding:'80px 0', maxWidth:'800px', margin:'0 auto'}} id="faq">
        <div className="section-header">
          <h2>Frequently Asked Questions</h2>
        </div>
        <div className="faq-accordion">
          {[
            {q: "What is OmniDimension?", a: "OmniDimension is a complete platform for building, deploying, and managing voice AI assistants."},
            {q: "How much does it cost?", a: "We offer a flexible pay-as-you-go pricing model starting at $0.07/minute, alongside structured monthly plans. Visit our pricing page for details."},
            {q: "Can I use my own phone numbers?", a: "Yes, you can import your existing SIP trunks or purchase new phone numbers instantly from our dashboard in over 50 countries."},
            {q: "Do you offer enterprise support?", a: "Yes, our Enterprise plan includes dedicated Slack/WhatsApp support, custom SLA, and volume discounts."}
          ].map((faq, i) => (
            <div className={`faq-item ${activeFaq === i ? 'open' : ''}`} key={i}>
              <button className="faq-question" onClick={() => toggleFaq(i)}>
                <span>{faq.q}</span>
                <span style={{fontSize:'20px'}}>{activeFaq === i ? '−' : '+'}</span>
              </button>
              <div className="faq-answer">
                <p>{faq.a}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
      
      {/* Ask Kevin AI Chat Bubble (Decorative) */}
      <div style={{position:'fixed', bottom:'24px', right:'24px', background:'var(--teal)', color:'#0a0a0a', padding:'12px 20px', borderRadius:'30px', fontWeight:700, display:'flex', alignItems:'center', gap:'8px', cursor:'pointer', boxShadow:'0 10px 25px rgba(0, 212, 200, 0.3)', zIndex:100}}>
        🤖 Ask Kevin
      </div>
    </>
  );
}
