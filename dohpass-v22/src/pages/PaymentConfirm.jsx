import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { ACTIVATION_WINDOW, SUPPORT_EMAIL } from '../lib/paymentConfig';

const TRACKS = [
  { value: 'gp', label: 'GP Track' },
  { value: 'specialist', label: 'Internal Medicine Specialist' },
  { value: 'all_access', label: 'All Access (GP + Specialist)' },
];

export default function PaymentConfirm() {
  const [form, setForm] = useState({
    login_email: '', track: '', payment_reference: '', payer_name: '', amount: '', note: '',
  });
  const [status, setStatus] = useState('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.login_email.trim());
  const canSubmit = emailOk && form.track && status !== 'submitting';

  async function handleSubmit() {
    if (!canSubmit) return;
    setStatus('submitting'); setErrorMsg('');
    // NO .select() — anon has INSERT only, not SELECT. Adding .select() will error.
    const { error } = await supabase.from('payment_requests').insert({
      login_email: form.login_email.trim().toLowerCase(),
      track: form.track,
      payment_reference: form.payment_reference.trim() || null,
      payer_name: form.payer_name.trim() || null,
      amount: form.amount ? Number(form.amount) : null,
      note: form.note.trim() || null,
    });
    if (error) {
      setStatus('error');
      setErrorMsg(`Your details could not be sent. Try again, or email ${SUPPORT_EMAIL} with your payment reference.`);
      return;
    }
    setStatus('done');
  }

  if (status === 'done') {
    return (
      <main id="main" className="pc-wrap on-paper">
      <div className="pc-page pc-page--center" role="status">
        <div className="pc-success-icon" aria-hidden="true">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
        </div>
        <h1 className="pc-title">Details received</h1>
        <p className="pc-sub">
          We'll match your transfer and activate access within {ACTIVATION_WINDOW}, on the
          account for <span className="pc-strong">{form.login_email}</span>.
        </p>
        <p className="pc-finehint">
          No access after {ACTIVATION_WINDOW}? Email {SUPPORT_EMAIL} with your payment reference.
        </p>
      </div>
      </main>
    );
  }

  return (
    <main id="main" className="pc-wrap on-paper">
    <div className="pc-page">
      <h1 className="pc-title">Confirm a bank transfer</h1>
      <p className="pc-sub">
        Already paid by bank transfer / Wise? Enter your details below and we'll activate your
        access. Use the <strong>same email you signed up with</strong>.
      </p>
      <div className="pc-form">
        <Field label="Login email" required>
          <input type="email" inputMode="email" autoComplete="email" value={form.login_email}
            onChange={set('login_email')} placeholder="you@example.com" className="pc-input" />
          {form.login_email && !emailOk && (
            <span className="pc-invalid">Enter the email address you signed up with, like name@example.com.</span>
          )}
        </Field>
        <Field label="Track purchased" required>
          <select value={form.track} onChange={set('track')} className="pc-input">
            <option value="" disabled>Select a track…</option>
            {TRACKS.map((t) => (<option key={t.value} value={t.value}>{t.label}</option>))}
          </select>
        </Field>
        <Field label="Payment reference" hint="From your bank receipt, e.g. FT261998M2F8">
          <input type="text" value={form.payment_reference} onChange={set('payment_reference')}
            placeholder="FT261998M2F8" className="pc-input" />
        </Field>
        <Field label="Name on the transfer" hint="Optional — helps us match your payment">
          <input type="text" value={form.payer_name} onChange={set('payer_name')}
            placeholder="Full name" className="pc-input" />
        </Field>
        <Field label="Amount (AED)" hint="Optional">
          <input type="number" inputMode="decimal" value={form.amount} onChange={set('amount')}
            placeholder="49" className="pc-input" />
        </Field>
        <Field label="Anything else?" hint="Optional">
          <textarea rows={2} value={form.note} onChange={set('note')} className="pc-input pc-input--noresize" />
        </Field>
        {status === 'error' && <p className="pc-invalid" role="alert">{errorMsg}</p>}
        <button type="button" onClick={handleSubmit} disabled={!canSubmit}
          className="pc-submit" aria-busy={status === 'submitting'}>
          {status === 'submitting' ? 'Sending…' : 'Send payment details'}
        </button>
      </div>
    </div>
    </main>
  );
}

function Field({ label, required, hint, children }) {
  return (
    <label className="pc-field">
      <span className="pc-label">
        {label} {required && <span className="pc-req">*</span>}
      </span>
      {children}
      {hint && <span className="pc-hint">{hint}</span>}
    </label>
  );
}
