import React, { useEffect, useState } from 'react';
import type { IeltsPrimePlan } from '../../../services/ieltsPrimeBillingService';
import {
  cancelLocalPayment,
  getLocalPaymentOptions,
  submitLocalPayment,
  type LocalPaymentMethod,
  type LocalPaymentOptions,
} from '../../../services/ieltsLocalPaymentService';

/** "Pay by MBank / O!Dengi / Elsom" on the Prime page: transfer, tell us, the owner confirms, Prime switches on. Russian. */

const PLAN_LABEL: Record<IeltsPrimePlan, string> = { monthly: '1 месяц', quarterly: '3 месяца', yearly: '1 год' };
const METHODS: { id: LocalPaymentMethod; label: string }[] = [
  { id: 'mbank', label: 'MBank' },
  { id: 'odengi', label: 'O!Деньги' },
  { id: 'elsom', label: 'Элсом' },
  { id: 'optima', label: 'Optima' },
  { id: 'other', label: 'Другой банк' },
];
const fmt = (n: number) => `${new Intl.NumberFormat('ru-RU').format(n)} сом`;

const box: React.CSSProperties = {
  background: 'linear-gradient(180deg, rgba(16,185,129,0.14), rgba(15,23,42,0.92))',
  border: '1px solid rgba(52,211,153,0.45)',
  borderRadius: '1.25rem',
  padding: '1.35rem',
  marginBottom: '2rem',
  color: '#e2e8f0',
};
const input: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.22)',
  background: 'rgba(2,6,23,0.55)', color: '#fff', padding: '0.8rem 0.9rem', fontSize: '1rem',
};
const chip = (on: boolean): React.CSSProperties => ({
  flex: '1 1 0', minWidth: 96, borderRadius: '0.85rem', padding: '0.75rem 0.6rem', cursor: 'pointer', textAlign: 'center',
  border: on ? '2px solid #34d399' : '1px solid rgba(255,255,255,0.2)',
  background: on ? 'rgba(16,185,129,0.22)' : 'rgba(255,255,255,0.05)', color: '#fff',
});

const IeltsLocalPayment: React.FC<{ onSubmitted?: () => void }> = ({ onSubmitted }) => {
  const [options, setOptions] = useState<LocalPaymentOptions | null>(null);
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<IeltsPrimePlan>('quarterly');
  const [method, setMethod] = useState<LocalPaymentMethod>('mbank');
  const [payerName, setPayerName] = useState('');
  const [payerPhone, setPayerPhone] = useState('');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = () => getLocalPaymentOptions().then(setOptions);
  useEffect(() => { void load(); }, []);

  if (!options?.enabled) return null;
  const latest = options.latest;
  const amount = options.prices[plan];

  const copy = (label: string, text: string) => {
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(label);
      window.setTimeout(() => setCopied(null), 1600);
    });
  };

  if (latest?.status === 'pending') {
    return (
      <section style={box} aria-live="polite">
        <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.25rem' }}>⏳ Проверяем ваш перевод</h2>
        <p style={{ margin: '0 0 0.75rem', lineHeight: 1.6 }}>
          {PLAN_LABEL[latest.plan]} · <b>{fmt(latest.amount_som)}</b>. Как только деньги поступят, мы включим IELTS Prime
          и пришлём письмо. Обычно это занимает несколько часов, днём — быстрее.
        </p>
        <button
          type="button"
          onClick={() => void cancelLocalPayment(latest.id).then(load)}
          style={{ background: 'none', border: 'none', color: '#94a3b8', textDecoration: 'underline', cursor: 'pointer', padding: 0 }}
        >
          Отменить заявку
        </button>
      </section>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = await submitLocalPayment({ plan, method, payerName, payerPhone, reference });
    setBusy(false);
    if (!result.ok) { setError(result.error); return; }
    await load();
    onSubmitted?.();
  };

  return (
    <section style={box}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.25rem' }}>🇰🇬 Оплата переводом: {options.bank_label}, O!Деньги, Элсом</h2>
          <p style={{ margin: '0.35rem 0 0', color: '#a7f3d0' }}>Без карты Visa · от {fmt(options.prices.monthly)} в месяц</p>
        </div>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            style={{ border: 'none', borderRadius: '0.85rem', padding: '0.85rem 1.1rem', background: 'linear-gradient(135deg,#34d399,#10b981)', color: '#022c22', fontWeight: 800, cursor: 'pointer' }}
          >
            Оплатить переводом
          </button>
        )}
      </div>

      {latest?.status === 'rejected' && (
        <p role="alert" style={{ margin: '0.9rem 0 0', color: '#fecaca' }}>
          Мы не нашли ваш прошлый перевод{latest.review_note ? `: ${latest.review_note}` : '.'} Проверьте данные и отправьте ещё раз.
        </p>
      )}

      {open && (
        <form onSubmit={submit} style={{ marginTop: '1.1rem', display: 'grid', gap: '1rem' }}>
          <div>
            <b>1. Выберите тариф</b>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }} role="radiogroup" aria-label="Тариф">
              {(['monthly', 'quarterly', 'yearly'] as IeltsPrimePlan[]).map((p) => (
                <button key={p} type="button" role="radio" aria-checked={plan === p} onClick={() => setPlan(p)} style={chip(plan === p)}>
                  <div style={{ fontWeight: 700 }}>{PLAN_LABEL[p]}</div>
                  <div style={{ color: '#fde68a', fontWeight: 800 }}>{fmt(options.prices[p])}</div>
                </button>
              ))}
            </div>
          </div>

          <div style={{ background: 'rgba(2,6,23,0.5)', borderRadius: '0.9rem', padding: '0.95rem', lineHeight: 1.7 }}>
            <b>2. Переведите {fmt(amount)}</b>
            <div>
              по номеру телефона{' '}
              <button type="button" onClick={() => copy('phone', options.recipient_phone || '')} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', borderRadius: 8, padding: '0.15rem 0.5rem', fontWeight: 800, cursor: 'pointer' }}>
                {options.recipient_phone} {copied === 'phone' ? '✓' : '⧉'}
              </button>
              {options.recipient_name ? <> · получатель <b>{options.recipient_name}</b></> : null}
            </div>
            <div>
              сумма{' '}
              <button type="button" onClick={() => copy('amount', String(amount))} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', borderRadius: 8, padding: '0.15rem 0.5rem', fontWeight: 800, cursor: 'pointer' }}>
                {amount} {copied === 'amount' ? '✓' : '⧉'}
              </button>
            </div>
            {options.instructions && <div style={{ color: '#cbd5e1', marginTop: '0.35rem' }}>{options.instructions}</div>}
          </div>

          <div style={{ display: 'grid', gap: '0.6rem' }}>
            <b>3. Сообщите нам о переводе</b>
            <label>
              <span style={{ fontSize: '0.9rem', color: '#cbd5e1' }}>Имя отправителя, как в банке *</span>
              <input style={input} value={payerName} onChange={(e) => setPayerName(e.target.value)} required minLength={2} maxLength={120} autoComplete="name" placeholder="Айгерим С." />
            </label>
            <label>
              <span style={{ fontSize: '0.9rem', color: '#cbd5e1' }}>Способ оплаты</span>
              <select style={input} value={method} onChange={(e) => setMethod(e.target.value as LocalPaymentMethod)}>
                {METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </label>
            <label>
              <span style={{ fontSize: '0.9rem', color: '#cbd5e1' }}>Телефон отправителя (необязательно)</span>
              <input style={input} value={payerPhone} onChange={(e) => setPayerPhone(e.target.value)} maxLength={40} inputMode="tel" autoComplete="tel" placeholder="+996 …" />
            </label>
            <label>
              <span style={{ fontSize: '0.9rem', color: '#cbd5e1' }}>Номер или время перевода (необязательно)</span>
              <input style={input} value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} placeholder="например, 14:32 или № чека" />
            </label>
          </div>

          {error && <p role="alert" style={{ margin: 0, color: '#fecaca' }}>{error}</p>}

          <button
            type="submit"
            disabled={busy}
            style={{ border: 'none', borderRadius: '0.85rem', padding: '0.95rem 1rem', background: 'linear-gradient(135deg,#ffd23f,#ff8a1f)', color: '#2a1400', fontWeight: 800, fontSize: '1.05rem', cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.75 : 1 }}
          >
            {busy ? 'Отправляем…' : `Я перевёл(а) ${fmt(amount)}`}
          </button>
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>
            Мы проверим поступление и включим Prime на {PLAN_LABEL[plan]}. Подписка не продлевается автоматически.
          </p>
        </form>
      )}
    </section>
  );
};

export default IeltsLocalPayment;
