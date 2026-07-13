import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, MessageCircle, Loader2 } from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL ?? "";

export default function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [showPass, setShowPass] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (form.password.length < 8) {
      setErrorMsg("Password must be at least 8 characters.");
      return;
    }
    if (form.password !== form.confirm) {
      setErrorMsg("Passwords do not match.");
      return;
    }

    setStatus("submitting");

    try {
      const res = await fetch(`${API_URL}/api/v1/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name, email: form.email, password: form.password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.message || data.error || "Registration failed. Please try again.");
        setStatus("error");
        return;
      }

      setStatus("success");
      setTimeout(() => navigate("/login"), 1200);
    } catch {
      setErrorMsg("Network error. Please check your connection.");
      setStatus("error");
    }
  };

  const strength = form.password.length >= 12 ? 4 : form.password.length >= 10 ? 3 : form.password.length >= 8 ? 2 : form.password.length > 0 ? 1 : 0;
  const strengthColor = strength >= 3 ? "#22c55e" : strength === 2 ? "#f59e0b" : "#ef4444";

  const features = [
    { icon: "⚡", title: "Quick Setup", desc: "Connect your WhatsApp number in minutes" },
    { icon: "📢", title: "Bulk Campaigns", desc: "Reach thousands of contacts at once" },
    { icon: "🤖", title: "Smart Automation", desc: "Auto-replies, triggers, and workflows" },
    { icon: "📊", title: "Live Analytics", desc: "Track delivery, read rates, and replies" },
  ];

  return (
    <div className="min-h-screen flex" style={{ background: "hsl(222 47% 6%)" }}>

      {/* ── Left Panel ── */}
      <div className="hidden lg:flex w-[45%] flex-col justify-between p-12 relative overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #0a1628 0%, #0d1f3c 50%, #091a2f 100%)",
          borderRight: "1px solid rgba(99,102,241,0.15)",
        }}>

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

        {/* Copy */}
        <div className="z-10">
          <h2 className="text-white font-extrabold text-3xl leading-tight mb-3">
            Start growing with<br />
            <span style={{ color: "hsl(239 84% 72%)" }}>WhatsApp marketing.</span>
          </h2>
          <p className="text-sm mb-10" style={{ color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>
            Join thousands of businesses using ChatFlow Pro to drive engagement, automate support, and boost sales.
          </p>

          {features.map((f) => (
            <div key={f.title} className="flex items-start gap-3 mb-5">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-base"
                style={{ background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)" }}>
                {f.icon}
              </div>
              <div>
                <div className="text-white font-semibold text-sm mb-0.5">{f.title}</div>
                <div className="text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>{f.desc}</div>
              </div>
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
        <div className="w-full max-w-[420px]">

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
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold mb-4"
              style={{ background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.25)", color: "hsl(239 84% 72%)" }}>
              ✨ Free plan — no credit card needed
            </div>
            <h1 className="text-white font-extrabold text-2xl tracking-tight mb-2">Create your account</h1>
            <p className="text-sm" style={{ color: "rgba(255,255,255,0.45)" }}>
              Already have an account?{" "}
              <Link to="/login" className="font-semibold" style={{ color: "hsl(239 84% 72%)", textDecoration: "none" }}>
                Sign in →
              </Link>
            </p>
          </div>

          {/* Google */}
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
            <span className="text-xs font-medium" style={{ color: "rgba(255,255,255,0.3)" }}>or sign up with email</span>
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
                ✓ Account created! Redirecting to login...
              </div>
            )}

            {/* Name */}
            <div>
              <label className="block text-xs font-semibold text-white mb-2">Full Name</label>
              <input
                type="text" name="name" placeholder="John Smith"
                value={form.name} onChange={handleChange} required
                className="w-full rounded-lg px-3 py-2.5 text-sm text-white outline-none"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)" }}
                onFocus={(e) => (e.currentTarget.style.border = "1px solid hsl(239 84% 67%)")}
                onBlur={(e) => (e.currentTarget.style.border = "1px solid rgba(255,255,255,0.12)")}
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-xs font-semibold text-white mb-2">Work Email</label>
              <input
                type="email" name="email" placeholder="you@company.com"
                value={form.email} onChange={handleChange} required
                className="w-full rounded-lg px-3 py-2.5 text-sm text-white outline-none"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)" }}
                onFocus={(e) => (e.currentTarget.style.border = "1px solid hsl(239 84% 67%)")}
                onBlur={(e) => (e.currentTarget.style.border = "1px solid rgba(255,255,255,0.12)")}
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-semibold text-white mb-2">Password</label>
              <div className="relative">
                <input
                  type={showPass ? "text" : "password"} name="password" placeholder="Min. 8 characters"
                  value={form.password} onChange={handleChange} required
                  className="w-full rounded-lg px-3 py-2.5 pr-11 text-sm text-white outline-none"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)" }}
                  onFocus={(e) => (e.currentTarget.style.border = "1px solid hsl(239 84% 67%)")}
                  onBlur={(e) => (e.currentTarget.style.border = "1px solid rgba(255,255,255,0.12)")}
                />
                <button type="button" onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 bg-transparent border-0 cursor-pointer p-0"
                  style={{ color: "rgba(255,255,255,0.35)" }}>
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {form.password.length > 0 && (
                <div className="flex gap-1 mt-2">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex-1 h-0.5 rounded-full transition-all"
                      style={{ background: i <= strength ? strengthColor : "rgba(255,255,255,0.1)" }} />
                  ))}
                </div>
              )}
            </div>

            {/* Confirm */}
            <div>
              <label className="block text-xs font-semibold text-white mb-2">Confirm Password</label>
              <input
                type={showPass ? "text" : "password"} name="confirm" placeholder="Re-enter your password"
                value={form.confirm} onChange={handleChange} required
                className="w-full rounded-lg px-3 py-2.5 text-sm text-white outline-none"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)" }}
                onFocus={(e) => (e.currentTarget.style.border = "1px solid hsl(239 84% 67%)")}
                onBlur={(e) => (e.currentTarget.style.border = "1px solid rgba(255,255,255,0.12)")}
              />
            </div>

            <p className="text-xs" style={{ color: "rgba(255,255,255,0.35)", lineHeight: 1.5 }}>
              By signing up, you agree to our{" "}
              <a href="#" style={{ color: "hsl(239 84% 72%)", textDecoration: "none" }}>Terms</a> and{" "}
              <a href="#" style={{ color: "hsl(239 84% 72%)", textDecoration: "none" }}>Privacy Policy</a>.
            </p>

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
              {(status === "idle" || status === "error") && "Create Free Account →"}
              {status === "submitting" && (
                <><Loader2 className="w-4 h-4 animate-spin" /> Creating account...</>
              )}
              {status === "success" && "✓ Done!"}
            </button>
          </form>

        </div>
      </div>
    </div>
  );
}
