import React, { useState } from 'react';
import { API_BASE_URL } from '../config/constants';

interface LoginPageProps {
  onLoginSuccess: (token: string, user: any) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      localStorage.setItem('auth_token', data.token);
      onLoginSuccess(data.token, data.user);
    } catch {
      setError('Incorrect username or password');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ fontFamily: "'Nunito', sans-serif", position: 'relative', width: '100%', height: '100vh', overflow: 'hidden' }}>
      {/* Full-screen background image -- object-fit: cover prevents tiling */}
      <img
        src="/images/Login_Background.jpg"
        alt=""
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: 'center',
        }}
      />

      {/* Dark overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.55)',
        }}
      />

      {/* Centered content */}
      <div
        style={{
          position: 'relative',
          zIndex: 10,
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
        }}
      >
        {/* Frosted glass card */}
        <div
          style={{
            width: '100%',
            maxWidth: '420px',
            background: 'rgba(255, 255, 255, 0.1)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            borderRadius: '24px',
            border: '1px solid rgba(255, 255, 255, 0.18)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
            padding: '48px 36px 40px',
          }}
        >
          {/* Branding */}
          <div style={{ textAlign: 'center', marginBottom: '28px' }}>
            {/* Logo cropped into a circle */}
            <img
              src="/images/Carleton_Logo_Main.jpg"
              alt="Carleton University"
              style={{
                display: 'block',
                margin: '0 auto 16px',
                width: '100px',
                height: '100px',
                borderRadius: '50%',
                objectFit: 'cover',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.35)',
              }}
            />
            <h2
              style={{
                fontSize: '1.5rem',
                fontWeight: 700,
                color: '#fff',
                textShadow: '0 2px 8px rgba(0,0,0,0.4)',
                lineHeight: 1.2,
              }}
            >
              Smart Scheduler
            </h2>
            <p
              style={{
                fontSize: '0.8rem',
                fontWeight: 500,
                color: 'rgba(255,255,255,0.5)',
                marginTop: '4px',
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
              }}
            >
              Carleton University
            </p>
          </div>

          {/* Sign In heading */}
          <div style={{ textAlign: 'center', marginBottom: '8px' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fff' }}>Sign In</h3>
            <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)', marginTop: '4px' }}>
              Enter your credentials to continue
            </p>
          </div>

          {/* Error message */}
          {error && (
            <div
              style={{
                backgroundColor: 'rgba(229, 23, 63, 0.2)',
                border: '1px solid rgba(229, 23, 63, 0.4)',
                color: '#fca5a5',
                borderRadius: '12px',
                padding: '10px 14px',
                fontSize: '0.85rem',
                marginBottom: '16px',
                marginTop: '16px',
              }}
            >
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ marginTop: '20px' }}>
            <div style={{ marginBottom: '18px' }}>
              <label
                htmlFor="email"
                style={{
                  display: 'block',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: 'rgba(255,255,255,0.8)',
                  marginBottom: '6px',
                  letterSpacing: '0.02em',
                }}
              >
                Email or Username
              </label>
              <input
                id="email"
                type="text"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: '12px',
                  border: '1px solid rgba(255,255,255,0.2)',
                  backgroundColor: 'rgba(255,255,255,0.08)',
                  color: '#fff',
                  fontSize: '0.95rem',
                  fontFamily: "'Nunito', sans-serif",
                  outline: 'none',
                  transition: 'border-color 0.2s, box-shadow 0.2s',
                  boxSizing: 'border-box',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#E5173F';
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(229, 23, 63, 0.25)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
            </div>

            <div style={{ marginBottom: '28px' }}>
              <label
                htmlFor="password"
                style={{
                  display: 'block',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: 'rgba(255,255,255,0.8)',
                  marginBottom: '6px',
                  letterSpacing: '0.02em',
                }}
              >
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '12px 48px 12px 16px',
                    borderRadius: '12px',
                    border: '1px solid rgba(255,255,255,0.2)',
                    backgroundColor: 'rgba(255,255,255,0.08)',
                    color: '#fff',
                    fontSize: '0.95rem',
                    fontFamily: "'Nunito', sans-serif",
                    outline: 'none',
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                    boxSizing: 'border-box',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#E5173F';
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(229, 23, 63, 0.25)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'rgba(255,255,255,0.5)',
                    transition: 'color 0.2s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.85)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.5)'; }}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    /* Eye-off icon */
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    /* Eye icon */
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              style={{
                width: '100%',
                padding: '13px',
                borderRadius: '12px',
                border: 'none',
                backgroundColor: '#E5173F',
                color: '#fff',
                fontSize: '1rem',
                fontWeight: 700,
                fontFamily: "'Nunito', sans-serif",
                cursor: isLoading ? 'not-allowed' : 'pointer',
                opacity: isLoading ? 0.7 : 1,
                transition: 'background-color 0.2s, transform 0.1s, opacity 0.2s',
                boxShadow: '0 4px 14px rgba(229, 23, 63, 0.4)',
              }}
              onMouseEnter={(e) => {
                if (!isLoading) e.currentTarget.style.backgroundColor = '#c41235';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#E5173F';
              }}
              onMouseDown={(e) => {
                if (!isLoading) e.currentTarget.style.transform = 'scale(0.98)';
              }}
              onMouseUp={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              {isLoading ? 'Signing in...' : 'Sign In'}
            </button>

          </form>
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          position: 'absolute',
          bottom: '20px',
          width: '100%',
          textAlign: 'center',
          zIndex: 10,
          color: 'rgba(255,255,255,0.4)',
          fontSize: '0.75rem',
          fontFamily: "'Nunito', sans-serif",
        }}
      >
        Carleton University Smart Scheduler
      </div>
    </div>
  );
};
