/** components/EmptyState.jsx - Friendly "nothing here" and "something failed (retry)" states. */
import Icon from './Icon.jsx';

export default function EmptyState({ icon = 'inbox', title, text, action }) {
  return (
    <div className="empty-state">
      <div className="empty-icon"><Icon name={icon} /></div>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="empty-state error-state" role="alert">
      <div className="empty-icon"><Icon name="alert" /></div>
      <h3>Could not load this section</h3>
      <p>{error?.message || String(error)}</p>
      {onRetry && <button className="btn btn-ghost btn-sm" onClick={onRetry}><Icon name="refresh" size="sm" /> Try again</button>}
    </div>
  );
}

/**
 * Renders the right state for a useApi() result: loader -> error -> children(data).
 *   <AsyncView query={q}>{(data) => ...}</AsyncView>
 */
export function AsyncView({ query, loading, children }) {
  if (query.loading && !query.data) return loading || <div className="loading-block"><div className="spinner" /><span>Loading...</span></div>;
  if (query.error) return <ErrorState error={query.error} onRetry={query.reload} />;
  if (!query.data) return null;
  return children(query.data);
}
