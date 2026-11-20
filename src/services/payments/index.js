/**
 * payments/index.js - Picks the payment provider.
 * Both providers implement: createOrder(payment), refund(payment, amount), getStatus(payment).
 * Razorpay is used when its test keys are configured; otherwise the offline simulator.
 */
import { config } from '../../config/index.js';
import { SimulatedGateway } from './simulated.gateway.js';
import { RazorpayGateway } from './razorpay.gateway.js';

export const razorpayEnabled = () => Boolean(config.razorpay.keyId && config.razorpay.keySecret);

export function activeGateway() {
  return razorpayEnabled() ? RazorpayGateway : SimulatedGateway;
}

export function gatewayFor(name) {
  return name === 'razorpay' ? RazorpayGateway : SimulatedGateway;
}
