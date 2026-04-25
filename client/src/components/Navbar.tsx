import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Home,
  Shield,
  Stethoscope,
  Utensils,
  TrendingUp,
  GraduationCap,
  ShoppingCart,
  Phone,
  Calendar,
  MessageCircle,
  Headphones,
  Settings,
  Radio,
  Cloud
} from "lucide-react";

export default function Navbar() {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const checkLogin = () => {
      setIsLoggedIn(!!localStorage.getItem('token'));
    };
    
    checkLogin();
    
    // Listen for storage changes
    window.addEventListener('storage', checkLogin);
    return () => window.removeEventListener('storage', checkLogin);
  }, []);

  const isActive = (path: string) => {
    return location.pathname === path ? 'active' : '';
  };

  return (
    <nav className="navbar">
      <Link to="/" className="navbar-logo">
        <span style={{fontWeight: 800, fontSize: '18px', letterSpacing: '-1px'}}>
          OMNI<span style={{color:'var(--teal)'}}>D</span>IMENSION
        </span>
      </Link>

      <ul className="navbar-nav">
        <li 
          className="nav-dropdown"
          onMouseEnter={() => setDropdownOpen(true)}
          onMouseLeave={() => setDropdownOpen(false)}
        >
          <a href="#" className="nav-link" onClick={(e) => e.preventDefault()}>
            Solutions 
            <svg width="12" height="12" viewBox="0 0 12 12">
              <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
            </svg>
          </a>

          {dropdownOpen && (
            <div className="dropdown-menu" style={{display: 'flex'}}>

              {/* Industry */}
              <div>
                <div className="dropdown-col-title">Industry Verticals</div>

                <a href="#" className="dropdown-item">
                  <span className="item-icon"><Home size={16} /></span>Real Estate
                </a>

                <a href="#" className="dropdown-item">
                  <span className="item-icon"><Shield size={16} /></span>Insurance
                </a>

                <a href="#" className="dropdown-item">
                  <span className="item-icon"><Stethoscope size={16} /></span>Healthcare
                </a>

                <a href="#" className="dropdown-item">
                  <span className="item-icon"><Utensils size={16} /></span>Restaurants
                </a>

                <a href="#" className="dropdown-item">
                  <span className="item-icon"><TrendingUp size={16} /></span>Finance
                </a>

                <a href="#" className="dropdown-item">
                  <span className="item-icon"><GraduationCap size={16} /></span>Education
                </a>

                <a href="#" className="dropdown-item">
                  <span className="item-icon"><ShoppingCart size={16} /></span>E-commerce
                </a>
              </div>

              {/* Use Cases */}
              <div>
                <div className="dropdown-col-title">Use Cases</div>

                <a href="#" className="dropdown-item">
                  <span className="item-icon"><Phone size={16} /></span>Lead Generation
                </a>

                <a href="#" className="dropdown-item">
                  <span className="item-icon"><Calendar size={16} /></span>Collections
                </a>

                <a href="#" className="dropdown-item">
                  <span className="item-icon"><MessageCircle size={16} /></span>Negotiation
                </a>

                <a href="#" className="dropdown-item">
                  <span className="item-icon"><Headphones size={16} /></span>Customer Support
                </a>

                <a href="#" className="dropdown-item">
                  <span className="item-icon"><Calendar size={16} /></span>Appointments
                </a>
              </div>

              {/* Integrations */}
              <div>
                <div className="dropdown-col-title">Popular Integrations</div>

                <a href="#" className="dropdown-item">
                  <span className="item-icon"><Settings size={16} /></span>
                  <div>
                    <div>Custom API</div>
                    <div className="dropdown-item-sub">Connect any external API</div>
                  </div>
                </a>

                <a href="#" className="dropdown-item">
                  <span className="item-icon"><Radio size={16} /></span>
                  <div>
                    <div>SIP Trunking</div>
                    <div className="dropdown-item-sub">Connect to any telephony system</div>
                  </div>
                </a>

                <a href="#" className="dropdown-item">
                  <span className="item-icon"><Calendar size={16} /></span>
                  <div>
                    <div>Cal.com</div>
                    <div className="dropdown-item-sub">Appointment scheduling</div>
                  </div>
                </a>

                <a href="#" className="dropdown-item">
                  <span className="item-icon"><Cloud size={16} /></span>
                  <div>
                    <div>Salesforce</div>
                    <div className="dropdown-item-sub">CRM sync & automation</div>
                  </div>
                </a>
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

        <Link to="/dashboard" style={{ color: 'var(--text-secondary)', fontSize: '14px', fontWeight: 500, textDecoration: 'none' }}>Dashboard</Link>
        <button className="btn-sign-out">Sign Out</button>

        {isLoggedIn ? (
          <>
            <Link to="/dashboard" style={{ color: 'var(--text-secondary)', fontSize: '14px', fontWeight: 500, textDecoration: 'none' }}>Dashboard</Link>
            <button 
              onClick={() => {
                localStorage.clear();
                setIsLoggedIn(false);
                window.location.href = '/';
              }}
              className="btn btn-primary" 
              style={{ padding: '8px 18px', fontSize: '14px' }}
            >
              Sign Out
            </button>
          </>
        ) : (
          <>
            <Link to="/login" style={{ color: 'var(--text-secondary)', fontSize: '14px', fontWeight: 500, textDecoration: 'none' }}>Log In</Link>
            <Link to="/signup" className="btn btn-primary" style={{ padding: '8px 18px', fontSize: '14px' }}>Get Started Free</Link>
          </>
        )}

      </div>
    </nav>
  );
}