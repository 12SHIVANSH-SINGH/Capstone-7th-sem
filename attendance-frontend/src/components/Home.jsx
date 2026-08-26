import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import Navbar from './Navbar/navbar';
import './Home.css';
import { FaGraduationCap, FaQrcode, FaChartBar, FaUserShield, FaCheckDouble, FaCalendarCheck } from 'react-icons/fa';

function Home() {
  useEffect(() => {
    const handleScroll = () => {
      const elements = document.querySelectorAll('.scroll-animation');
      elements.forEach(element => {
        const elementTop = element.getBoundingClientRect().top;
        const elementBottom = element.getBoundingClientRect().bottom;
        
        if (elementTop < window.innerHeight - 50 && elementBottom > 0) {
          element.classList.add('animate');
        }
      });
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <>
      <Navbar />
      <div className="home-container">
        {/* Hero Section */}
        <section className="hero-section">
          <div className="hero-content">
            <div className="badge">Next-Gen Campus</div>
            <h1 className="hero-title">
              University Attendance
              <span className="gradient-text"> Made Effortless</span>
            </h1>
            <p className="hero-subtitle">
              Secure, accurate, and seamless attendance tracking for students and faculty. Experience the future of academic administration.
            </p>
            <div className="btn-group">
              <Link to="/login" className="btn btn-primary pulse">
                Faculty & Student Login
              </Link>
            </div>
          </div>
          <div className="hero-graphic">
            <div className="graphic-circle">
              <FaGraduationCap className="cap-icon" />
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="features">
          <h2 className="section-title scroll-animation">Why Use Our Portal?</h2>
          <div className="features-grid">
            {[
              { icon: <FaUserShield />, title: 'Secure Authentication', text: 'State-of-the-art passkey and biometric security.' },
              { icon: <FaQrcode />, title: 'Location Verified', text: 'Geolocation checks ensure students are physically in class.' },
              { icon: <FaChartBar />, title: 'Academic Analytics', text: 'Visual insights into attendance trends and semester records.' },
              { icon: <FaCheckDouble />, title: 'Instant Processing', text: 'Real-time synchronization with the university database.' },
            ].map((feature, index) => (
              <div className="feature-card scroll-animation" key={index}>
                <div className="feature-icon">{feature.icon}</div>
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Stats Section */}
        <section className="stats scroll-animation">
          <div className="stat-item">
            <FaGraduationCap className="stat-icon" />
            <h3>15,000+</h3>
            <p>Students Enrolled</p>
          </div>
          <div className="stat-item">
            <FaCalendarCheck className="stat-icon" />
            <h3>99.9%</h3>
            <p>System Uptime</p>
          </div>
          <div className="stat-item">
            <FaCheckDouble className="stat-icon" />
            <h3>5M+</h3>
            <p>Classes Logged</p>
          </div>
        </section>

        {/* CTA Section */}
        <section className="cta-section scroll-animation">
          <div className="cta-content">
            <h2>Ready to Access the Portal?</h2>
            <p>Join the thousands of faculty and students already using the system.</p>
            <div className="btn-group">
              <Link to="/register" className="btn btn-secondary">
                Register Account
              </Link>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="footer">
          <div className="footer-content">
            <div className="footer-section">
              <h4>University Portal</h4>
              <p>Advancing academic excellence through smart administration.</p>
            </div>
            <div className="footer-section">
              <h4>Resources</h4>
              <Link to="/help">Help Center</Link>
              <Link to="/academic-calendar">Academic Calendar</Link>
              <Link to="/privacy">Privacy Policy</Link>
            </div>
          </div>
          <div className="footer-bottom">
            <p>© 2024 University Attendance System. All rights reserved.</p>
          </div>
        </footer>
      </div>
    </>
  );
}

export default Home;