/** admin/finance.controller.js - Payments (filters + detail) and refund processing. */
import * as payments from '../../services/payments/payment.service.js';
import { idParam } from '../../middleware/validate.js';

export async function listPayments(req, res) {
  const { status = '', method = '', gateway = '', purpose = '', search = '' } = req.query;
  res.ok(await payments.adminListPayments({ status, method, gateway, purpose, search }));
}
export const getPayment = async (req, res) => res.ok(await payments.getPaymentDetail(idParam(req)));
export const listRefunds = async (req, res) => res.ok(await payments.listRefunds({ status: req.query.status || '' }));
export async function processRefund(req, res) {
  const refund = await payments.processRefund(idParam(req), req.user);
  res.ok({ refund, message: `Refund ${refund.refundRef} processed for ${refund.targetCode}` });
}
