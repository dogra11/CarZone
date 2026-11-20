/** components/PublicLayout.jsx - Navbar + page content + footer for public (non-dashboard) pages. */
import Navbar from './Navbar.jsx';
import Footer from './Footer.jsx';

export default function PublicLayout({ children, solid = false, glow = false }) {
  return (
    <>
      {glow && <div className="page-glow" />}
      <Navbar solid={solid} />
      {children}
      <Footer />
    </>
  );
}
