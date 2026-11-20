/** components/StatCard.jsx - KPI card used on both dashboards. tone: '' | 'gold' | 'green' | 'red' */
import Icon from './Icon.jsx';

export default function StatCard({ icon, label, value, sub, tone = '' }) {
  return (
    <div className={`stat-card ${tone}`}>
      <div className="stat-icon"><Icon name={icon} /></div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}
