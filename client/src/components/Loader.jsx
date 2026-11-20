/** components/Loader.jsx - Loading states: a spinner block and shimmering skeleton placeholders. */
export function Loader({ text = 'Loading...', fullPage = false }) {
  return (
    <div className="loading-block" style={fullPage ? { minHeight: '100vh' } : undefined} role="status">
      <div className="spinner" /><span>{text}</span>
    </div>
  );
}

export function Skeleton({ count = 3, className = 'skeleton-card' }) {
  return Array.from({ length: count }, (_, i) => <div key={i} className={`skeleton ${className}`} aria-hidden="true" />);
}
