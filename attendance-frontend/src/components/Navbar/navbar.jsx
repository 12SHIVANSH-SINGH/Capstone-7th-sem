import React from 'react';
import { Link } from 'react-router-dom';
import Brand from '../../ui/Brand';
import './Navbar.css';

// Public top bar for the landing page. Two items — no mobile menu needed.
const Navbar = () => (
  <nav className="navbar">
    <div className="navbar__inner">
      <Brand />
      <Link to="/login" className="ui-btn ui-btn--primary ui-btn--sm">Sign in</Link>
    </div>
  </nav>
);

export default Navbar;
