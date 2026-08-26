import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './Navbar.css';

const Navbar = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768 && isMobileMenuOpen) {
        closeMobileMenu();
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isMobileMenuOpen]);

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <Link to="/" className="logo">
          Bio<span>Attend</span>
        </Link>
        
        <div className={`nav-buttons ${isMobileMenuOpen ? 'show' : ''}`}>
          <Link to="/login" className="login-btn" onClick={closeMobileMenu}>
            Login
          </Link>
          <Link to="/register" className="signup-btn" onClick={closeMobileMenu}>
            Sign Up
          </Link>
        </div>

        <button 
          className="hamburger" 
          onClick={toggleMobileMenu}
          aria-label="Toggle navigation"
        >
          <span className={`hamburger-line ${isMobileMenuOpen ? 'open' : ''}`} />
          <span className={`hamburger-line ${isMobileMenuOpen ? 'open' : ''}`} />
          <span className={`hamburger-line ${isMobileMenuOpen ? 'open' : ''}`} />
        </button>
      </div>
    </nav>
  );
};

export default Navbar;