import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

export default function AuthCallback() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const token = params.get('token');
    const refreshToken = params.get('refreshToken');
    const workspaceId = params.get('workspaceId');
    const error = params.get('error');

    if (error || !token) {
      navigate('/login?error=google_failed');
      return;
    }

    localStorage.setItem('token', token);
    if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
    if (workspaceId) localStorage.setItem('workspaceId', workspaceId);

    navigate('/dashboard');
  }, []);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', color: 'white', fontSize: '16px' }}>
      Signing you in...
    </div>
  );
}
