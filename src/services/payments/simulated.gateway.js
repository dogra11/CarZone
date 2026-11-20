/**
 * payments/simulated.gateway.js - The default, fully offline payment gateway.
 *
 * It behaves like a real gateway so the whole checkout can be demonstrated:
 *   card       -> Luhn-checked number, then a 3-D Secure OTP step (demo OTP 123456).
 *                 Cards ending in 0002 are declined by the "issuing bank".
 *   upi        -> a collect request that stays PENDING for a few seconds while the
 *                 browser polls the status; VPA failure@upi is declined.
 *   netbanking -> a simulated bank page where the customer approves or declines.
 *   wallet     -> instant success.
 * It implements the same provider interface as the Razorpay gateway:
 *   createOrder(payment), refund(payment, amountPaise), getStatus(payment)
 * plus start()/verify() helpers used only by the simulator UI.
 */
import crypto from 'node:crypto';
import { randomCode } from '../../utils/ids.js';
import { TEST_PAYMENT_VALUES, NETBANKING_BANKS, WALLETS, validate, schemas } from '../../utils/shared.js';
import { AppError } from '../../utils/AppError.js';

export const DEMO_OTP = TEST_PAYMENT_VALUES.otp;
export const UPI_APPROVAL_SECONDS = 4;
const DETAIL_SCHEMAS = { card: schemas.cardDetails, upi: schemas.upiDetails, netbanking: schemas.netbankingDetails, wallet: schemas.walletDetails };

export const hashOtp = (paymentRef, otp) => crypto.createHash('sha256').update(`${paymentRef}:${otp}`).digest('hex');

function cardBrand(number) {
  if (number.startsWith('4')) return 'Visa';
  if (/^5[1-5]/.test(number)) return 'Mastercard';
  if (/^3[47]/.test(number)) return 'Amex';
  if (/^(60|65|81|82|508)/.test(number)) return 'RuPay';
  return 'Card';
}

export const SimulatedGateway = {
  name: 'simulated',

  async createOrder() {
    return { gatewayOrderId: `sim_order_${randomCode(14)}` };
  },

  /**
   * Validates the customer's details and decides the next step.
   * Returns { outcome: 'failed'|'otp'|'poll'|'bank'|'success', detail, failureReason? }.
   * Card numbers and CVVs are only checked here - they are NEVER stored.
   */
  start(method, rawDetails) {
    if (method === 'upi' && rawDetails?.mode === 'qr') return { outcome: 'poll', detail: 'UPI QR' };
    const { valid, errors, values: d } = validate(DETAIL_SCHEMAS[method], rawDetails || {});
    if (!valid) throw AppError.unprocessable('Please check your payment details', errors);
    switch (method) {
      case 'card': {
        const detail = `${cardBrand(d.cardNumber)} **** ${d.cardNumber.slice(-4)}`;
        if (d.cardNumber.endsWith('0002')) return { outcome: 'failed', detail, failureReason: 'Card declined by the issuing bank' };
        return { outcome: 'otp', detail };
      }
      case 'upi':
        return { outcome: 'poll', detail: d.upiId };
      case 'netbanking':
        if (!NETBANKING_BANKS.includes(d.bank)) throw AppError.unprocessable('Choose a supported bank', { bank: 'Choose a bank' });
        return { outcome: 'bank', detail: d.bank };
      case 'wallet':
        if (!WALLETS.includes(d.wallet)) throw AppError.unprocessable('Choose a supported wallet', { wallet: 'Choose a wallet' });
        return { outcome: 'success', detail: d.wallet };
      default:
        throw AppError.unprocessable('Unsupported payment method');
    }
  },

  /** UPI collect requests resolve after the approval delay; failure@upi is declined. */
  resolveUpi(payment) {
    return String(payment.method_detail).toLowerCase() === TEST_PAYMENT_VALUES.failUpi
      ? { success: false, failureReason: 'UPI request declined by the payer' }
      : { success: true };
  },

  async refund() {
    return { gatewayRefundId: `sim_rfnd_${randomCode(14)}` };
  },

  async getStatus(payment) {
    return { status: payment.status };
  },

  newPaymentId: () => `sim_pay_${randomCode(14)}`,
};
