import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

export default function Navbar() {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const location = useLocation();

  const isActive = (path: string) => {
    return location.pathname === path ? 'active' : '';
  };

  return (
    <nav className="navbar">
      <Link to="/" className="navbar-logo">
        <div className="logo-icon">O</div>
        <span>OMNI<span style={{color:'var(--teal)', fontStyle:'italic', fontWeight:900}}>D</span>IMENSION</span>
      </Link>
      <ul className="navbar-nav">
        <li 
          className="nav-dropdown"
          onMouseEnter={() => setDropdownOpen(true)}
          onMouseLeave={() => setDropdownOpen(false)}
        >
          <a href="#" className="nav-link" onClick={(e) => e.preventDefault()}>
            Solutions <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/></svg>
          </a>
          {dropdownOpen && (
            <div className="dropdown-menu" style={{display: 'flex'}}>
              <div>
                <div className="dropdown-col-title">🏢 Industry Verticals</div>
                <a href="#" className="dropdown-item"><span className="item-icon">🏠</span>Real Estate</a>
                <a href="#" className="dropdown-item"><span className="item-icon">🛡️</span>Insurance</a>
                <a href="#" className="dropdown-item"><span className="item-icon">🏥</span>Healthcare</a>
                <a href="#" className="dropdown-item"><span className="item-icon">🍽️</span>Restaurants</a>
                <a href="#" className="dropdown-item"><span className="item-icon">📈</span>Finance</a>
                <a href="#" className="dropdown-item"><span className="item-icon">🎓</span>Education</a>
                <a href="#" className="dropdown-item"><span className="item-icon">🛒</span>E-commerce</a>
              </div>
              <div>
                <div className="dropdown-col-title">⚡ Use Cases</div>
                <a href="#" className="dropdown-item"><span className="item-icon">📞</span>Lead Generation</a>
                <a href="#" className="dropdown-item"><span className="item-icon">📅</span>Collections</a>
                <a href="#" className="dropdown-item"><span className="item-icon">🗣️</span>Negotiation</a>
                <a href="#" className="dropdown-item"><span className="item-icon">🎧</span>Customer Support</a>
                <a href="#" className="dropdown-item"><span className="item-icon">📅</span>Appointments</a>
              </div>
              <div>
                <div className="dropdown-col-title">🔌 Popular Integrations</div>
                <a href="#" className="dropdown-item"><span className="item-icon">⚙️</span><div><div>Custom API</div><div className="dropdown-item-sub">Connect any external API</div></div></a>
                <a href="#" className="dropdown-item"><span className="item-icon">📡</span><div><div>SIP Trunking</div><div className="dropdown-item-sub">Connect to any telephony system</div></div></a>
                <a href="#" className="dropdown-item"><span className="item-icon">📆</span><div><div>Cal.com</div><div className="dropdown-item-sub">Appointment scheduling</div></div></a>
                <a href="#" className="dropdown-item"><span className="item-icon">☁️</span><div><div>Salesforce</div><div className="dropdown-item-sub">CRM sync & automation</div></div></a>
              </div>
            </div>
          )}
        </li>
        <li><Link to="/documentation" className={`nav-link ${isActive('/documentation')}`}>Documentation</Link></li>
        <li><Link to="/pricing" className={`nav-link ${isActive('/pricing')}`}>Pricing</Link></li>
        <li><Link to="/contact" className={`nav-link ${isActive('/contact')}`}>Contact Us</Link></li>
        <li><Link to="/book-appointment" className={`nav-link ${isActive('/book-appointment')}`}>Book an Appointment</Link></li>
      </ul>
      <div className="navbar-actions">
        <Link to="/login" style={{ color: 'var(--text-secondary)', fontSize: '14px', fontWeight: 500, textDecoration: 'none' }}>Log In</Link>
        <Link to="/signup" className="btn btn-primary" style={{ padding: '8px 18px', fontSize: '14px' }}>Get Started Free</Link>
      </div>
    </nav>
  );
}
