import React from 'react';
import { Link } from 'react-router-dom';
import Brand from '../../ui/Brand';
import { dashboardPath } from '../../utils/auth';
import './Navbar.css';

// Public top bar for the landing page. The right-hand action follows the
// cookie session so a signed-in visitor never sees "Sign in" again.
const Navbar = ({ user, loading = false }) => (
  <nav className="navbar">
    <div className="navbar__inner">
      <Brand />
      {loading ? (
        <span className="navbar__status">Checking session…</span>
      ) : (
        <Link to={user ? dashboardPath(user.role) : "/login"} className="ui-btn ui-btn--primary ui-btn--sm">
          {user ? "Open dashboard" : "Sign in"}
        </Link>
      )}
    </div>
  </nav>
);

export default Navbar;
