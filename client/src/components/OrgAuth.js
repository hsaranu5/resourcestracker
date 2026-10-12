import React, { useState } from 'react';
import axios from 'axios';

// Relative by default so the CRA dev proxy (and same-origin production) carry
// the httpOnly session cookie without any CORS ceremony.
const API_URL = process.env.REACT_APP_API_URL || '/api';

// The email prefill lives in localStorage: harmless if exposed (the inbox code
// is the actual gate) and it saves regular posters retyping. The session token
// itself is never in localStorage — it stays in the httpOnly cookie.
const EMAIL_KEY = 'orgLoginEmail';

/**
 * Sign-in for verified organisations: email → 6-digit emailed code → session.
 * Calls onSignedIn({ organization, email }) when the session is established.
 */
const OrgAuth = ({ onSignedIn, onCancel, title = 'Post as an organization' }) => {
  const [step, setStep] = useState('email'); // 'email' | 'code'
  const [email, setEmail] = useState(() => localStorage.getItem(EMAIL_KEY) || '');
  const [code, setCode] = useState('');
  const [remember, setRemember] = useState(false); // default OFF: safe on shared computers
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const requestCode = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await axios.post(`${API_URL}/auth/request-code`, { email: email.trim() });
      localStorage.setItem(EMAIL_KEY, email.trim());
      setNotice(res.data.message);
      setStep('code');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not request a code. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await axios.post(`${API_URL}/auth/verify`, {
        email: email.trim(),
        code: code.trim(),
        rememberDevice: remember
      });
      onSignedIn({ organization: res.data.organization, email: res.data.email });
    } catch (err) {
      setError(err.response?.data?.error || 'That code did not work. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const clearSavedEmail = () => {
    localStorage.removeItem(EMAIL_KEY);
    setEmail('');
  };

  if (step === 'code') {
    return (
      <div className="form-container">
        <h3>Enter your code</h3>
        <p style={{ fontSize: '13px', color: '#9aa0a6' }}>{notice}</p>
        <form onSubmit={verifyCode}>
          <div className="form-group">
            <label>6-digit code sent to {email}</label>
            <input
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              autoFocus
              required
            />
          </div>
          <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="checkbox"
              id="remember-device"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              style={{ width: 'auto', margin: 0 }}
            />
            <label htmlFor="remember-device" style={{ margin: 0, fontWeight: 'normal' }}>
              Remember this device for 30 days
              <span style={{ display: 'block', fontSize: '11px', color: '#888' }}>
                Leave unchecked on shared or public computers
              </span>
            </label>
          </div>
          {error && <p style={{ color: '#e57373', fontSize: '13px' }}>{error}</p>}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="submit" className="form-button" disabled={busy || code.length !== 6}>
              {busy ? 'Checking...' : 'Sign in'}
            </button>
            <button
              type="button"
              className="form-button"
              style={{ background: '#666' }}
              onClick={() => { setStep('email'); setCode(''); setError(''); }}
            >
              Back
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="form-container">
      <h3>{title}</h3>
      <p style={{ fontSize: '13px', color: '#9aa0a6' }}>
        Posting is limited to organizations verified by Care Beyond.
        Enter your organization email and we'll send a sign-in code.
      </p>
      <form onSubmit={requestCode}>
        <div className="form-group">
          <label>Organization email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@yourorg.org"
            autoFocus
            required
          />
          {localStorage.getItem(EMAIL_KEY) && email === localStorage.getItem(EMAIL_KEY) && (
            <button
              type="button"
              onClick={clearSavedEmail}
              style={{
                background: 'none', border: 'none', color: '#1976d2',
                fontSize: '12px', cursor: 'pointer', padding: '4px 0'
              }}
            >
              Not you? Clear saved email
            </button>
          )}
        </div>
        {error && <p style={{ color: '#e57373', fontSize: '13px' }}>{error}</p>}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button type="submit" className="form-button" disabled={busy}>
            {busy ? 'Sending...' : 'Send code'}
          </button>
          <button type="button" className="form-button" style={{ background: '#666' }} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default OrgAuth;
