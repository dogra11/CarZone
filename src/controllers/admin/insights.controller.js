/**
 * admin/insights.controller.js - Dashboard analytics and report exports (Express handlers).
 * Uses res.set() for headers and res.send() for CSV/HTML, res.ok() for JSON.
 * GET /api/admin/reports/:type?from=&to=&format=json|csv|html
 *   json -> admin table, csv -> Excel download, html -> printable page (Save as PDF).
 */
import { getDashboardAnalytics } from '../../services/analytics.service.js';
import { getReport, reportRowsForExport } from '../../services/report.service.js';
import { renderReportHtml } from '../../services/document.service.js';
import { toCsv } from '../../utils/csv.js';
import { todayISO, addDaysISO } from '../../utils/dates.js';

export const analytics = async (req, res) => res.ok(await getDashboardAnalytics());

export async function report(req, res) {
  const { from = addDaysISO(todayISO(), -30), to = addDaysISO(todayISO(), 30), format = 'json' } = req.validQuery;
  const data = await getReport(req.params.type, from, to);
  if (format === 'csv') {
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="carzone-${data.type}-${from}-to-${to}.csv"`,
    });
    return res.send(toCsv(data.columns, reportRowsForExport(data)));
  }
  if (format === 'html') return res.send(renderReportHtml(data)); // Express sets text/html for strings
  res.ok(data);
}
