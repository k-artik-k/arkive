import { useState } from 'react';

export default function PassphraseDialog({ mode = 'unlock', onSubmit, onCancel }) {
  const [passphrase, setPassphrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!passphrase) {
      setError('Passphrase is required');
      return;
    }
    if (mode === 'set' && passphrase !== confirm) {
      setError('Passphrases do not match');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const result = await onSubmit(passphrase);
      if (result && typeof result === 'string') {
        setError(result);
      }
    } catch (err) {
      setError(err?.message || 'Unable to verify passphrase');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>{mode === 'set' ? 'Set Passphrase' : 'Enter Passphrase'}</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 12 }}>
          {mode === 'set'
            ? 'This post will be encrypted. You must remember the passphrase to access it.'
            : 'This post is locked. Enter the passphrase to view it.'}
        </p>
        <input
          type="password"
          placeholder="Passphrase"
          value={passphrase}
          onChange={(e) => { setPassphrase(e.target.value); setError(''); }}
          onKeyDown={(e) => e.key === 'Enter' && !submitting && handleSubmit()}
          style={{ width: '100%', marginBottom: 8 }}
          autoFocus
        />
        {mode === 'set' && (
          <input
            type="password"
            placeholder="Confirm passphrase"
            value={confirm}
            onChange={(e) => { setConfirm(e.target.value); setError(''); }}
            onKeyDown={(e) => e.key === 'Enter' && !submitting && handleSubmit()}
            style={{ width: '100%', marginBottom: 8 }}
          />
        )}
        {error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={submitting}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Working...' : mode === 'set' ? 'Lock Post' : 'Unlock'}
          </button>
        </div>
      </div>
    </div>
  );
}
