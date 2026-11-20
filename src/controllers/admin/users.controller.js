/** admin/users.controller.js - Admin management of customer and admin accounts. */
import * as users from '../../services/user.service.js';
import { idParam } from '../../middleware/validate.js';

export const list = async (req, res) => res.ok(await users.listUsers({ search: req.query.search || '', role: req.query.role || '' }));
export const getOne = async (req, res) => res.ok(await users.getUser(idParam(req)));
export const create = async (req, res) => res.ok({ user: await users.createUser(req.valid), message: 'User created' }, 201);
export const update = async (req, res) => res.ok({ user: await users.updateUser(req.user.id, idParam(req), req.valid), message: 'User updated' });
export async function remove(req, res) {
  await users.deleteUser(req.user.id, idParam(req));
  res.ok({ message: 'User deleted' });
}
