/** contact.controller.js - Public contact form submission. */
import { createMessage } from '../services/contact.service.js';

export async function submit(req, res) {
  await createMessage(req.valid);
  res.ok({ message: 'Thanks for reaching out! Our team will get back to you within one working day.' }, 201);
}
