import React from 'react';
import { Link } from 'react-router-dom';
import Navbar from './Navbar/navbar';
import useSession from '../hooks/useSession';
import { dashboardPath } from '../utils/auth';
import './Home.css';
import { FaUserShield, FaVolumeUp, FaMobileAlt, FaFileCsv } from 'react-icons/fa';

// Decorative equalizer in the hero — deterministic heights, pure CSS animation.
const WAVE = [8, 14, 22, 30, 18, 26, 12, 20, 28, 16, 24, 10, 18, 26, 32, 22, 14, 20, 28, 16, 10, 24, 30, 18, 12, 22, 16, 26];

function Home() {
  const { user, loading } = useSession();
  const dashboard = user ? dashboardPath(user.role) : null;

  return (
    <>
      <Navbar user={user} loading={loading} />
      <div className="home">
        <section className="hero">
          <div className="hero__inner">
            <span className="hero__badge">Near-ultrasonic · works on any Android Chrome phone</span>
            <h1>
              Attendance built to show
              <span className="hero__accent"> who’s in the room.</span>
            </h1>
            <p className="hero__sub">
              Bio Attend is built to pass one-time key tones between student phones and record which phones hear them.
              The full check-in will decide attendance — no GPS, no roll-call, no extra hardware.
            </p>
            <div className="hero__actions">
              {loading ? (
                <span className="hero__session-note">Checking your session…</span>
              ) : (
                <Link to={dashboard || "/login"} className="ui-btn ui-btn--primary ui-btn--lg">
                  {dashboard ? "Open your dashboard" : "Sign in with college Google"}
                </Link>
              )}
              <a href="#how" className="ui-btn ui-btn--secondary ui-btn--lg">See how it works</a>
            </div>
            <div className="hero__wave" aria-hidden="true">
              {WAVE.map((height, index) => (
                <span key={index} style={{ height: `${height}px`, animationDelay: `${(index % 7) * 0.12}s` }} />
              ))}
            </div>
          </div>
        </section>

        <section className="section" id="how">
          <h2>How a check-in works</h2>
          <p className="section__sub">Three steps, about a minute, nothing for students to install.</p>
          <div className="steps__grid">
            <article className="step">
              <span className="step__num">1</span>
              <h3>Teacher starts a check-in</h3>
              <p>The server mints a one-time key for the class — it exists for minutes, not days.</p>
            </article>
            <article className="step">
              <span className="step__num">2</span>
              <h3>Phones swap key tones</h3>
              <p>In the full flow, student phones play and listen for near-ultrasonic tones — inaudible to the class, unique per session.</p>
            </article>
            <article className="step">
              <span className="step__num">3</span>
              <h3>The server records evidence</h3>
              <p>Whoever hears the key has evidence recorded. The server decides attendance only after the full check-in — a forwarded key alone does not prove presence.</p>
            </article>
          </div>
        </section>

        <section className="section">
          <div className="features__grid">
            <article className="feature">
              <span className="feature__icon"><FaUserShield /></span>
              <h3>College Google sign-in</h3>
              <p>Only verified NIT Jamshedpur accounts enter the system — no passwords to leak or forget.</p>
            </article>
            <article className="feature">
              <span className="feature__icon"><FaVolumeUp /></span>
              <h3>Acoustic evidence</h3>
              <p>Hearing a key is designed to be recorded as evidence. Attendance is decided only after the full check-in — a forwarded key alone doesn’t prove presence.</p>
            </article>
            <article className="feature">
              <span className="feature__icon"><FaMobileAlt /></span>
              <h3>One device per student</h3>
              <p>Each browser binds to a device key; a changed device waits for teacher approval. The first binding is auto-approved.</p>
            </article>
            <article className="feature">
              <span className="feature__icon"><FaFileCsv /></span>
              <h3>Rosters you already have</h3>
              <p>Paste or upload the class CSV once — attendance is matched to real roster identities.</p>
            </article>
          </div>
        </section>

        <section className="cta-wrap">
          <div className="cta">
            <h2>{user ? "You’re already signed in." : "Ready when your class is."}</h2>
            <p>
              {user
                ? "Continue to your dashboard, or open the phone audio test."
                : "Sign in with your NIT Jamshedpur account to continue."}
            </p>
            <Link to={dashboard || "/login"} className="ui-btn ui-btn--lg">
              {dashboard ? "Open dashboard" : "Get started"}
            </Link>
          </div>
        </section>

        <footer className="footer">
          <div className="footer__inner">
            <span className="footer__note">© 2026 Bio Attend · NIT Jamshedpur capstone</span>
            <nav className="footer__links" aria-label="Footer">
              <Link to={dashboard || "/login"}>{dashboard ? "Dashboard" : "Sign in"}</Link>
              <Link to="/acoustic-lab">Phone audio test</Link>
            </nav>
          </div>
        </footer>
      </div>
    </>
  );
}

export default Home;
