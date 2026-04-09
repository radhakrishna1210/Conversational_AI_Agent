import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, MessageCircle, Loader2 } from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL ?? "";

export default function Login() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [showPass, setShowPass] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (!form.email || !form.password) {
      setErrorMsg("Please fill in all fields.");
      return;
    }

    setStatus("submitting");

    try {
      const res = await fetch(`${API_URL}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email, password: form.password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.message || data.error || "Invalid email or password.");
        setStatus("error");
        return;
      }

      localStorage.setItem("token", data.accessToken);
      localStorage.setItem("refreshToken", data.refreshToken);
      if (data.workspace?.id) {
        localStorage.setItem("workspaceId", data.workspace.id);
      }

      setStatus("success");
      setTimeout(() => navigate("/dashboard"), 600);
    } catch {
      setErrorMsg("Network error. Please check your connection.");
      setStatus("error");
    }
  };

  const features = [
    { icon: "💬", label: "Manage all your WhatsApp conversations" },
    { icon: "📢", label: "Launch bulk campaigns in minutes" },
    { icon: "🤖", label: "Automate replies with keyword triggers" },
    { icon: "📊", label: "Real-time delivery analytics" },
  ];

  return (
    <div className="min-h-screen flex" style={{ background: "hsl(222 47% 6%)" }}>

      {/* ── Left Panel ── */}
      <div className="hidden lg:flex w-[45%] flex-col justify-between p-12 relative overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #0a1628 0%, #0d1f3c 50%, #091a2f 100%)",
          borderRight: "1px solid rgba(99,102,241,0.15)",
        }}>

        {/* Glow blobs */}
        <div style={{ position: "absolute", top: "-80px", left: "-80px", width: "400px", height: "400px", background: "radial-gradient(circle, rgba(99,102,241,0.1) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: "-100px", right: "-60px", width: "350px", height: "350px", background: "radial-gradient(circle, rgba(139,92,246,0.07) 0%, transparent 70%)", pointerEvents: "none" }} />

        {/* Logo */}
        <div className="flex items-center gap-3 z-10">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "hsl(239 84% 67%)" }}>
            <MessageCircle className="w-5 h-5 text-white" />
          </div>
          <span className="text-white font-bold text-lg tracking-tight">
            ChatFlow<span style={{ color: "hsl(239 84% 72%)", fontStyle: "italic" }}>Pro</span>
          </span>
        </div>

        {/* Welcome copy */}
        <div className="z-10">
          <h2 className="text-white font-extrabold text-3xl leading-tight mb-4">
            Welcome back 👋
          </h2>
          <p className="text-base mb-10" style={{ color: "rgba(255,255,255,0.55)", lineHeight: 1.6 }}>
            Sign in to manage your WhatsApp campaigns, monitor conversations, and grow your audience.
          </p>

          {features.map((f) => (
            <div key={f.label} className="flex items-center gap-3 mb-4">
              <span className="text-lg">{f.icon}</span>
              <span className="text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>{f.label}</span>
            </div>
          ))}
        </div>

        {/* Social proof */}
        <div className="z-10" style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "24px" }}>
          <p className="text-xs mb-3" style={{ color: "rgba(255,255,255,0.3)" }}>Trusted by growing businesses</p>
          <div className="flex gap-3 flex-wrap">
            {["Shopify", "WooCommerce", "Razorpay", "HubSpot"].map((b) => (
              <span key={b} className="text-xs font-semibold px-3 py-1 rounded-full"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)" }}>
                {b}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right Panel ── */}
      <div className="flex-1 flex items-center justify-center px-6 py-12"
        style={{ background: "hsl(222 47% 6%)" }}>
        <div className="w-full max-w-[400px]">

          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "hsl(239 84% 67%)" }}>
              <MessageCircle className="w-4 h-4 text-white" />
            </div>
            <span className="text-white font-bold text-base">
              ChatFlow<span style={{ color: "hsl(239 84% 72%)", fontStyle: "italic" }}>Pro</span>
            </span>
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h1 className="text-white font-extrabold text-2xl tracking-tight mb-2">Sign in to your account</h1>
            <p className="text-sm" style={{ color: "rgba(255,255,255,0.45)" }}>
              Don't have an account?{" "}
              <Link to="/register" className="font-semibold" style={{ color: "hsl(239 84% 72%)", textDecoration: "none" }}>
                Create one free →
              </Link>
            </p>
          </div>

          {/* Google OAuth */}
          <button
            type="button"
            className="w-full flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-lg text-sm font-semibold text-white mb-6 transition-colors"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)" }}
            onMouseOver={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
            onMouseOut={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
            onClick={() => { window.location.href = `${API_URL}/api/v1/auth/google`; }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
            <span className="text-xs font-medium" style={{ color: "rgba(255,255,255,0.3)" }}>or sign in with email</span>
            <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">

            {errorMsg && (
              <div className="rounded-lg px-4 py-3 text-sm" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#fca5a5" }}>
                ⚠️ {errorMsg}
              </div>
            )}

            {status === "success" && (
              <div className="rounded-lg px-4 py-3 text-sm" style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)", color: "#86efac" }}>
                ✓ Login successful! Redirecting...
              </div>
            )}

            {/* Email */}
            <div>
              <label className="block text-xs font-semibold text-white mb-2">Email</label>
              <input
                type="email"
                name="email"
                placeholder="you@company.com"
                value={form.email}
                onChange={handleChange}
                required
                className="w-full rounded-lg px-3 py-2.5 text-sm text-white outline-none transition-colors"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.12)",
                }}
                onFocus={(e) => (e.currentTarget.style.border = "1px solid hsl(239 84% 67%)")}
                onBlur={(e) => (e.currentTarget.style.border = "1px solid rgba(255,255,255,0.12)")}
              />
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-white">Password</label>
                <a href="#" className="text-xs font-medium" style={{ color: "hsl(239 84% 72%)", textDecoration: "none" }}>
                  Forgot password?
                </a>
              </div>
              <div className="relative">
                <input
                  type={showPass ? "text" : "password"}
                  name="password"
                  placeholder="Enter your password"
                  value={form.password}
                  onChange={handleChange}
                  required
                  className="w-full rounded-lg px-3 py-2.5 pr-11 text-sm text-white outline-none transition-colors"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.12)",
                  }}
                  onFocus={(e) => (e.currentTarget.style.border = "1px solid hsl(239 84% 67%)")}
                  onBlur={(e) => (e.currentTarget.style.border = "1px solid rgba(255,255,255,0.12)")}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-0 bg-transparent border-0 cursor-pointer"
                  style={{ color: "rgba(255,255,255,0.35)" }}
                  onClick={() => setShowPass(!showPass)}
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={status === "submitting" || status === "success"}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-lg text-white font-bold text-sm mt-1 transition-opacity disabled:opacity-70"
              style={{
                background: status === "success"
                  ? "#22c55e"
                  : "linear-gradient(135deg, hsl(239 84% 60%) 0%, hsl(262 83% 58%) 100%)",
                boxShadow: "0 0 20px rgba(99,102,241,0.35)",
              }}
            >
              {status === "idle" || status === "error" ? "Sign In →" : null}
              {status === "submitting" && (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Signing in...
                </>
              )}
              {status === "success" && "✓ Done!"}
            </button>
          </form>

        </div>
      </div>
    </div>
  );
}
