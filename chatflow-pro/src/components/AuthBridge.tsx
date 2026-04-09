import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

/**
 * Reads token/workspaceId/refreshToken injected as URL params by the main app,
 * stores them in localStorage, then strips them from the URL so they don't persist.
 */
export default function AuthBridge() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const token = params.get('token');
    const workspaceId = params.get('workspaceId');
    const refreshToken = params.get('refreshToken');

    if (token) {
      localStorage.setItem('token', token);
      if (workspaceId) localStorage.setItem('workspaceId', workspaceId);
      if (refreshToken) localStorage.setItem('refreshToken', refreshToken);

      // Strip the auth params from the URL without triggering a reload
      params.delete('token');
      params.delete('workspaceId');
      params.delete('refreshToken');
      const clean = location.pathname + (params.toString() ? `?${params}` : '');
      navigate(clean, { replace: true });
    }
  }, []);

  return null;
}
