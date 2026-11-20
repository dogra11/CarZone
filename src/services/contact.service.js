/**
 * contact.service.js - Messages from the website contact form.
 */
import { one, all, run } from '../db/connection.js';
import { AppError } from '../utils/AppError.js';
import { nowSql } from '../utils/dates.js';

const mapMessage = (r) => ({
  id: r.id, name: r.name, email: r.email, phone: r.phone, subject: r.subject,
  message: r.message, status: r.status, createdAt: r.created_at,
});

export async function createMessage({ name, email, phone = null, subject, message }) {
  const { lastInsertRowid } = await run(
    'INSERT INTO contact_messages (name, email, phone, subject, message, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    name, email, phone, subject, message, nowSql(),
  );
  return mapMessage(await one('SELECT * FROM contact_messages WHERE id = ?', lastInsertRowid));
}

export const listMessages = async ({ status = '' } = {}) =>
  (await all("SELECT * FROM contact_messages WHERE (? = '' OR status = ?) ORDER BY status = 'new' DESC, created_at DESC", status, status)).map(mapMessage);

export async function updateMessageStatus(id, status) {
  const { changes } = await run('UPDATE contact_messages SET status = ? WHERE id = ?', status, id);
  if (!changes && !(await one('SELECT id FROM contact_messages WHERE id = ?', id))) throw AppError.notFound('Message not found');
  return mapMessage(await one('SELECT * FROM contact_messages WHERE id = ?', id));
}

export async function deleteMessage(id) {
  const { changes } = await run('DELETE FROM contact_messages WHERE id = ?', id);
  if (!changes) throw AppError.notFound('Message not found');
}
