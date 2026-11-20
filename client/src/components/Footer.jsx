/** components/Footer.jsx - Site footer with links and studio contact details (from /api/meta). */
import { Link } from '../router/index.jsx';
import { useMeta } from '../hooks/useMeta.js';
import Brand from './Brand.jsx';
import Icon from './Icon.jsx';

export default function Footer() {
  const meta = useMeta();
  const c = meta?.company || { address: 'Baner, Pune', phone: '', email: '' };
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div><Brand /><p className="mt-2 text-small" style={{ maxWidth: 320 }}>Premium car wash, detailing and ceramic protection in Pune. Book online, track every step and drive away shining.</p></div>
          <div><h4>Explore</h4><ul>
            <li><Link to="/services">All services</Link></li><li><Link to="/book">Book a wash</Link></li>
            <li><Link to="/#offers">Offers</Link></li><li><Link to="/#gallery">Gallery</Link></li><li><Link to="/#faq">FAQ</Link></li></ul></div>
          <div><h4>Account</h4><ul>
            <li><Link to="/login">Login</Link></li><li><Link to="/register">Create account</Link></li>
            <li><Link to="/dashboard">My dashboard</Link></li><li><Link to="/forgot-password">Reset password</Link></li></ul></div>
          <div><h4>Visit us</h4><ul className="footer-contact">
            <li><Icon name="map-pin" size="sm" /><span>{c.address}</span></li>
            <li><Icon name="phone" size="sm" /><a href={`tel:${c.phone.replace(/\s/g, '')}`}>{c.phone}</a></li>
            <li><Icon name="mail" size="sm" /><a href={`mailto:${c.email}`}>{c.email}</a></li>
            <li><Icon name="clock" size="sm" /><span>Open daily, 8:00 AM - 6:00 PM</span></li></ul></div>
        </div>
        <div className="footer-bottom"><span>&copy; {new Date().getFullYear()} CarZone Car Care Pvt. Ltd. All rights reserved.</span><span>Built with React + Node.js</span></div>
      </div>
    </footer>
  );
}
