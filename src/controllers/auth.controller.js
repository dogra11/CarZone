/**
 * auth.controller.js - HTTP layer for register / login / logout / password reset.
 * Controllers stay thin: read the validated input, call a service, send the result.
 *
 * The session cookie is written with Express's res.cookie() and removed with
 * res.clearCookie(). Note: in res.cookie() maxAge is in MILLISECONDS.
 */
import * as auth from '../services/auth.service.js';
import { config } from '../config/index.js';

/**
 * httpOnly : JavaScript in the page cannot read the cookie (protects against XSS token theft)
 * sameSite : 'strict' - not sent on requests started by other websites (protects against CSRF)
 * secure   : the browser sends the cookie over HTTPS only (never in clear text).
 *            true in production (Render serves https), false for local http://localhost;
 *            override with COOKIE_SECURE=true/false.
 */
export const SESSION_COOKIE_OPTIONS = Object.freeze({ httpOnly: true, sameSite: 'strict', path: '/', secure: config.cookieSecure });

async function startSession(req, res, user, remember) {
  const { cookieValue, maxAgeSeconds } = await auth.createSession(user.id, { remember, ip: req.ip, userAgent: req.get('user-agent') });
  res.cookie(auth.SESSION_COOKIE, cookieValue, { ...SESSION_COOKIE_OPTIONS, maxAge: maxAgeSeconds * 1000 });
}

const homeFor = (user) => (user.role === 'admin' ? '/admin' : '/dashboard');

export async function register(req, res) {
  const user = await auth.register(req.valid);
  await startSession(req, res, user, false);
  res.ok({ user, redirect: homeFor(user), message: `Welcome to CarZone, ${user.name.split(' ')[0]}!` }, 201);
}

export async function login(req, res) {
  const user = await auth.login(req.valid);
  await startSession(req, res, user, req.valid.remember);
  res.ok({ user, redirect: homeFor(user), message: `Welcome back, ${user.name.split(' ')[0]}!` });
}

export async function logout(req, res) {
  await auth.destroySession(req.sessionId);
  res.clearCookie(auth.SESSION_COOKIE, SESSION_COOKIE_OPTIONS);
  res.ok({ message: 'You have been logged out' });
}

/** Returns the logged-in user, or null for guests (200 either way - easy for the UI). */
export function me(req, res) {
  res.ok({ user: req.user });
}

export async function forgotPassword(req, res) {
  const { demoResetLink } = await auth.requestPasswordReset(req.valid.email);
  res.ok({ message: 'If an account exists for this email, a reset link has been sent. It is valid for a limited time.', demoResetLink });
}

export async function resetPassword(req, res) {
  await auth.resetPassword(req.valid);
  res.ok({ message: 'Password updated. Please log in with your new password.' });
}

export async function changePassword(req, res) {
  await auth.changePassword(req.user.id, req.sessionId, req.valid);
  res.ok({ message: 'Password changed. Other devices have been signed out.' });
}
