/**
 * components/PaymentCheckout.jsx - Gateway-style checkout shared by wash bookings and
 * store orders.
 *
 * PAYMENT FLOW (browser side)
 *   1. POST /api/payments with an IDEMPOTENCY KEY (one per attempt) -> payment session.
 *      The amount is decided by the server from the booking/order - never sent from here.
 *   2a. Razorpay (when test keys are configured): open Razorpay Checkout, then send the
 *       returned order id / payment id / signature to /verify (server checks the HMAC).
 *   2b. Simulator:
 *       card       -> /simulate -> 3-D Secure OTP screen -> /verify { otp }
 *       UPI        -> /simulate -> "waiting for approval" screen that POLLS /status
 *       net banking-> /simulate -> simulated bank page (approve / decline) -> /verify
 *       wallet     -> /simulate -> instant success
 *   3. Success -> onSuccess(payment). Failure -> clear reason + "Try again" (new key).
 * Card number / CVV are only sent to the server for validation and are never stored.
 */
import { useEffect, useRef, useState } from 'react';
import { api } from '../services/api.js';
import { useMeta } from '../hooks/useMeta.js';
import { useToast } from './Toast.jsx';
import { money } from '../utils/format.js';
import { validate, schemas, NETBANKING_BANKS, WALLETS, TEST_PAYMENT_VALUES } from '../utils/shared.js';
import FormField from './FormField.jsx';
import Icon from './Icon.jsx';

const METHODS = [['card', 'credit-card', 'Card'], ['upi', 'smartphone', 'UPI'], ['netbanking', 'bank', 'Net banking'], ['wallet', 'wallet', 'Wallet']];
const newKey = () => `pay_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

function cardBrand(num) {
  if (/^4/.test(num)) return 'Visa';
  if (/^5[1-5]/.test(num)) return 'Mastercard';
  if (/^3[47]/.test(num)) return 'Amex';
  if (/^(60|65|81|82|508)/.test(num)) return 'RuPay';
  return '';
}

/** Deterministic QR-style pattern drawn from the payment reference (demo only). */
function QrPattern({ seed }) {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const cells = [];
  for (let y = 0; y < 21; y++) {
    for (let x = 0; x < 21; x++) {
      const finder = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13);
      h = (h * 1103515245 + 12345) >>> 0;
      const on = finder ? (x % 6 === 0 || y % 6 === 0 || (x % 7 > 1 && x % 7 < 5 && y % 7 > 1 && y % 7 < 5) || (x > 13 && (x === 14 || x === 20)) || (y > 13 && (y === 14 || y === 20))) : (h >> 16) % 2 === 0;
      if (on) cells.push(<rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" />);
    }
  }
  return <svg viewBox="-1 -1 23 23" className="qr" aria-label="UPI QR code (demo)"><rect x="-1" y="-1" width="23" height="23" fill="#fff" /><g fill="#0b0d12">{cells}</g></svg>;
}

function loadRazorpayScript() {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('Could not load Razorpay Checkout. Check your internet connection.'));
    document.body.appendChild(s);
  });
}

export default function PaymentCheckout({ purpose, targetId, amountPaise, onSuccess, customer }) {
  const meta = useMeta();
  const toast = useToast();
  const [method, setMethod] = useState('card');
  const [stage, setStage] = useState('form');      // form | otp | upi | bank | failed | success
  const [payment, setPayment] = useState(null);
  const [demoOtp, setDemoOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const [card, setCard] = useState({ cardName: '', cardNumber: '', expiry: '', cvv: '' });
  const [upiId, setUpiId] = useState('');
  const [upiMode, setUpiMode] = useState('vpa');
  const [bank, setBank] = useState('');
  const [wallet, setWallet] = useState(WALLETS[0]);
  const [otp, setOtp] = useState('');
  const keyRef = useRef(newKey());
  const pollRef = useRef(null);
  const razorpay = meta?.paymentGateway === 'razorpay';

  useEffect(() => () => clearTimeout(pollRef.current), []);

  const finish = (p) => {
    setPayment(p);
    if (p.status === 'success') { setStage('success'); onSuccess(p); } else if (p.status === 'failed') setStage('failed');
  };

  /** Step 1: create (or reuse, thanks to the idempotency key) the payment session. */
  const createSession = async () => (await api.post('/api/payments', { purpose, targetId, idempotencyKey: keyRef.current })).payment;

  const poll = (id) => {
    pollRef.current = setTimeout(async () => {
      try {
        const { payment: p } = await api.get(`/api/payments/${id}/status`);
        if (p.status === 'pending') poll(id); else finish(p);
      } catch (err) { toast.error(err.message); setStage('failed'); }
    }, 1500);
  };

  const payWithRazorpay = async () => {
    const session = await createSession();
    await loadRazorpayScript();
    const c = session.checkout;
    await new Promise((resolve) => {
      const rzp = new window.Razorpay({
        key: c.keyId, order_id: c.orderId, amount: c.amount, currency: c.currency, name: c.name, description: c.description,
        prefill: { name: customer?.name, email: customer?.email, contact: customer?.phone }, theme: { color: '#2f8cff' },
        handler: async (resp) => {
          try { finish((await api.post(`/api/payments/${session.id}/verify`, resp)).payment); } catch (err) { toast.error(err.message); setStage('failed'); }
          resolve();
        },
        modal: { ondismiss: () => { toast.info('Payment window closed. You can try again.'); resolve(); } },
      });
      rzp.on('payment.failed', (r) => { toast.error(r.error?.description || 'Payment failed'); });
      rzp.open();
    });
  };

  const submit = async (e) => {
    e.preventDefault();
    setErrors({});
    const details = { card, upi: upiMode === 'qr' ? { mode: 'qr' } : { upiId }, netbanking: { bank }, wallet: { wallet } }[method];
    if (!razorpay && !(method === 'upi' && upiMode === 'qr')) {
      const schema = { card: schemas.cardDetails, upi: schemas.upiDetails, netbanking: schemas.netbankingDetails, wallet: schemas.walletDetails }[method];
      const r = validate(schema, details);
      if (!r.valid) { setErrors(r.errors); toast.warning('Please check your payment details.'); return; }
    }
    setBusy(true);
    try {
      if (razorpay) { await payWithRazorpay(); return; }
      const session = await createSession();
      const r = await api.post(`/api/payments/${session.id}/simulate`, { method, details });
      setPayment(r.payment);
      if (r.nextAction === 'otp') { setDemoOtp(r.demoOtp); setStage('otp'); }
      else if (r.nextAction === 'poll') { setStage('upi'); poll(r.payment.id); }
      else if (r.nextAction === 'bank') setStage('bank');
      else finish(r.payment);
    } catch (err) {
      if (err.fields) setErrors(err.fields);
      toast.error(err.message, 'Payment not started');
    } finally {
      setBusy(false);
    }
  };

  const verify = async (body) => {
    setBusy(true);
    try {
      const r = await api.post(`/api/payments/${payment.id}/verify`, body);
      finish(r.payment);
      if (r.payment.status === 'failed') toast.error(r.payment.failureReason, 'Payment failed');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const retry = () => {
    keyRef.current = newKey();          // a NEW attempt gets a NEW idempotency key
    setPayment(null);
    setOtp('');
    setStage('form');
  };

  const fill = (field, value) => setCard((c) => ({ ...c, [field]: value }));
  const brand = cardBrand(card.cardNumber.replace(/\s/g, ''));
  const t = TEST_PAYMENT_VALUES;

  if (stage === 'success') {
    return <div className="pay-stage center"><div className="success-mark"><Icon name="check" /></div><h3>Payment successful</h3><p className="text-muted">Ref {payment.paymentRef} · {payment.methodDetail}</p></div>;
  }
  if (stage === 'failed') {
    return (
      <div className="pay-stage center">
        <div className="fail-mark"><Icon name="x-circle" /></div>
        <h3>Payment failed</h3>
        <p className="text-muted">{payment?.failureReason || 'The payment could not be completed.'}</p>
        <p className="text-small text-muted">Nothing was charged. Your {purpose === 'booking' ? 'slot' : 'order'} is kept for you - you can try again or pay later from your dashboard.</p>
        <button className="btn btn-primary" onClick={retry}><Icon name="refresh" size="sm" /> Try again</button>
      </div>
    );
  }
  if (stage === 'otp') {
    return (
      <div className="pay-stage">
        <div className="bank-head"><Icon name="shield" /> <b>3-D Secure verification</b><span className="text-muted text-small">{payment.methodDetail}</span></div>
        <p>Enter the one-time password sent to your registered mobile to authorise <b>{money(amountPaise)}</b>.</p>
        <div className="alert alert-gold"><Icon name="info" /><p>Demo OTP: <b className="mono">{demoOtp}</b> (any other value fails)</p></div>
        <FormField label="OTP" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" className="mt-2" placeholder="6-digit OTP" />
        <div className="flex mt-3"><button className="btn btn-ghost" onClick={retry}>Cancel</button>
          <button className={`btn btn-primary ${busy ? 'is-loading' : ''}`} disabled={otp.length !== 6 || busy} onClick={() => verify({ otp })}>Verify & pay</button></div>
      </div>
    );
  }
  if (stage === 'upi') {
    return (
      <div className="pay-stage center">
        {payment?.methodDetail === 'UPI QR' ? <QrPattern seed={payment.paymentRef} /> : <div className="spinner" style={{ width: 56, height: 56, margin: '0 auto 18px' }} />}
        <h3>Waiting for approval</h3>
        <p className="text-muted">{payment?.methodDetail === 'UPI QR' ? 'Scan with any UPI app (demo) - it approves automatically in a few seconds.' : `Open your UPI app and approve the request sent to ${payment?.methodDetail}.`}</p>
        <p className="text-small text-muted">Checking status every 1.5 seconds...</p>
      </div>
    );
  }
  if (stage === 'bank') {
    return (
      <div className="pay-stage bank-page">
        <div className="bank-head"><Icon name="bank" /> <b>{payment.methodDetail} NetBanking</b><span className="badge badge-muted no-dot">Simulated bank page</span></div>
        <dl className="kv"><dt>Merchant</dt><dd>CarZone</dd><dt>Amount</dt><dd><b>{money(amountPaise)}</b></dd><dt>Reference</dt><dd className="mono">{payment.paymentRef}</dd></dl>
        <div className="flex mt-3"><button className="btn btn-danger" disabled={busy} onClick={() => verify({ bankDecision: 'decline' })}>Decline</button>
          <button className={`btn btn-primary ${busy ? 'is-loading' : ''}`} disabled={busy} onClick={() => verify({ bankDecision: 'approve' })}>Approve payment</button></div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate>
      {razorpay ? (
        <div className="alert alert-info"><Icon name="shield" /><p>Payments are processed by <b>Razorpay (test mode)</b>. Use card 4111 1111 1111 1111 or UPI success@razorpay.</p></div>
      ) : (
        <>
          <span className="label">Payment method</span>
          <div className="pay-methods choice-grid mt-1">
            {METHODS.map(([value, ic, label]) => (
              <label className="choice" key={value}><input type="radio" name="payMethod" value={value} checked={method === value} onChange={() => { setMethod(value); setErrors({}); }} />
                <span className="choice-box"><Icon name={ic} /><span className="choice-title">{label}</span></span></label>
            ))}
          </div>
          {method === 'card' && (
            <>
              <div className="card-preview">
                <div className="flex between"><div className="chip-img" /><b className="text-metal" style={{ position: 'relative', zIndex: 1 }}>{brand || 'CarZone Pay'}</b></div>
                <div className="num">{(card.cardNumber || '•••• •••• •••• ••••').padEnd(19, '•')}</div>
                <div className="meta"><span>{card.cardName || 'Card holder'}</span><span>{card.expiry || 'MM/YY'}</span></div>
              </div>
              <div className="form-grid">
                <FormField label="Name on card" span={2} value={card.cardName} error={errors.cardName} onChange={(e) => fill('cardName', e.target.value)} autoComplete="cc-name" />
                <FormField label="Card number" span={2} className="mono" value={card.cardNumber} error={errors.cardNumber} inputMode="numeric" placeholder="4111 1111 1111 1111"
                  onChange={(e) => fill('cardNumber', e.target.value.replace(/\D/g, '').slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 '))} />
                <FormField label="Expiry" value={card.expiry} error={errors.expiry} placeholder="MM/YY" inputMode="numeric"
                  onChange={(e) => { let v = e.target.value.replace(/\D/g, '').slice(0, 4); if (v.length > 2) v = `${v.slice(0, 2)}/${v.slice(2)}`; fill('expiry', v); }} />
                <FormField label="CVV" type="password" value={card.cvv} error={errors.cvv} placeholder="123" inputMode="numeric" onChange={(e) => fill('cvv', e.target.value.replace(/\D/g, '').slice(0, 4))} />
              </div>
            </>
          )}
          {method === 'upi' && (
            <>
              <div className="tabs mb-2"><button type="button" className={`tab ${upiMode === 'vpa' ? 'active' : ''}`} onClick={() => setUpiMode('vpa')}>UPI ID</button>
                <button type="button" className={`tab ${upiMode === 'qr' ? 'active' : ''}`} onClick={() => setUpiMode('qr')}>Scan QR</button></div>
              {upiMode === 'vpa'
                ? <FormField label="UPI ID (VPA)" value={upiId} error={errors.upiId} placeholder="yourname@okhdfcbank" hint="A collect request is sent to your UPI app." onChange={(e) => setUpiId(e.target.value)} />
                : <p className="text-muted">A QR code is generated when you continue. Scan it with any UPI app.</p>}
            </>
          )}
          {method === 'netbanking' && (
            <FormField label="Choose your bank" type="select" value={bank} error={errors.bank} onChange={(e) => setBank(e.target.value)}
              options={[{ value: '', label: 'Select bank' }, ...NETBANKING_BANKS.map((b) => ({ value: b, label: b }))]} />
          )}
          {method === 'wallet' && (
            <div className="choice-grid">{WALLETS.map((w) => (
              <label className="choice" key={w}><input type="radio" name="wallet" checked={wallet === w} onChange={() => setWallet(w)} />
                <span className="choice-box"><span className="check-mark"><Icon name="check" /></span><Icon name="wallet" /><span className="choice-title">{w}</span></span></label>))}
            </div>
          )}
        </>
      )}
      <button className={`btn btn-primary btn-lg btn-block mt-3 ${busy ? 'is-loading' : ''}`} type="submit" disabled={busy}>
        <Icon name="lock" size="sm" /> Pay {money(amountPaise)} securely
      </button>
      {!razorpay && (
        <div className="alert alert-gold test-values mt-3"><Icon name="info" /><div><b>Demo test values</b> (click to fill)<br />
          Card: <code onClick={() => { setMethod('card'); setCard({ cardName: 'Demo Customer', cardNumber: t.successCard, expiry: '12/29', cvv: '123' }); }}>{t.successCard}</code> (OTP {t.otp}) ·
          declined: <code onClick={() => { setMethod('card'); setCard({ cardName: 'Demo Customer', cardNumber: t.failCard, expiry: '12/29', cvv: '123' }); }}>{t.failCard}</code><br />
          UPI: <code onClick={() => { setMethod('upi'); setUpiMode('vpa'); setUpiId(t.successUpi); }}>{t.successUpi}</code> ·
          declined: <code onClick={() => { setMethod('upi'); setUpiMode('vpa'); setUpiId(t.failUpi); }}>{t.failUpi}</code>
        </div></div>
      )}
    </form>
  );
}
