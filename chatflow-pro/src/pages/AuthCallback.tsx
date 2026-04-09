import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";

/**
 * Landing page for the Google OAuth redirect.
 * Reads token / refreshToken / workspaceId from the URL, stores them in
 * localStorage, then sends the user to the dashboard.
 */
export default function AuthCallback() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const token       = params.get("token");
    const refreshToken = params.get("refreshToken");
    const workspaceId  = params.get("workspaceId");
    const error        = params.get("error");

    if (error) {
      navigate(`/login?error=${error}`, { replace: true });
      return;
    }

    if (token && workspaceId) {
      localStorage.setItem("token", token);
      localStorage.setItem("workspaceId", workspaceId);
      if (refreshToken) localStorage.setItem("refreshToken", refreshToken);
      navigate("/dashboard", { replace: true });
    } else {
      navigate("/login?error=missing_params", { replace: true });
    }
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "hsl(222 47% 6%)" }}>
      <div className="flex flex-col items-center gap-4 text-white">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
        <p className="text-sm text-white/60">Signing you in…</p>
      </div>
    </div>
  );
}
