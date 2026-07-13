import { useEffect, useRef } from 'react';
import { safeSet } from '@/lib/authStorage';
import { useNavigate, useLocation } from 'react-router-dom';

export default function AuthCallback() {
  const navigate = useNavigate();
  const location = useLocation();
  const processedRef = useRef(false);

  useEffect(() => {
    // React.StrictMode double-invokes effects in dev. Since this effect strips
    // the URL fragment on its first run, a second run would read an already-empty
    // hash and misfire the error path. Guard so only the first run counts.
    if (processedRef.current) return;
    processedRef.current = true;

    // Tokens now arrive in the URL FRAGMENT (#token=…): fragments never reach
    // servers, proxies, access logs, or the Referer header. We also support
    // the legacy ?query form for any in-flight redirects, then scrub the URL
    // from the address bar and history either way.
    const fragment = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
    const params = new URLSearchParams(fragment || location.search);

    const token = params.get('token');
    const refreshToken = params.get('refreshToken');
    const workspaceId = params.get('workspaceId');
    const name = params.get('name');
    const email = params.get('email');
    const error = params.get('error');

    // Remove tokens from the visible URL + history immediately.
    window.history.replaceState(null, '', '/auth/callback');

    if (error || !token) {
      navigate('/login?error=google_failed');
      return;
    }

    safeSet('token', token);
    if (refreshToken) safeSet('refreshToken', refreshToken);
    if (workspaceId) safeSet('workspaceId', workspaceId);
    // Persist profile so the navbar avatar and Settings aren't blank for
    // Google-authenticated users (they previously only got the token).
    if (name) safeSet('userName', name);
    if (email) safeSet('userEmail', email);

    navigate('/dashboard');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', color: 'var(--text-primary, #fff)', fontSize: '16px' }}>
      Signing you in...
    </div>
  );
}
