/**
 * components/DataTable.jsx - Generic table driven by a column list.
 *   <DataTable columns={[{ label: 'Name', render: (row) => row.name, num: false }]} rows={list} />
 * Shows an EmptyState when there are no rows.
 */
import EmptyState from './EmptyState.jsx';

export default function DataTable({ columns, rows, rowKey = (r) => r.id, empty = { icon: 'inbox', title: 'Nothing here yet' } }) {
  if (!rows.length) return <EmptyState {...empty} />;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr>{columns.map((c, i) => <th key={i} className={c.num ? 'num' : ''}>{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>{columns.map((c, i) => <td key={i} className={c.num ? 'num' : ''}>{c.render(row)}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
