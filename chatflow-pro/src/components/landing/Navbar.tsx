import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Menu, X, MessageSquare } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const navLinks = [
  { label: "Features", href: "#features" },
  { label: "Use Cases", href: "#usecases" },
  { label: "Pricing", href: "#pricing" },
  { label: "Integrations", href: "#integrations" },
];

export const Navbar = () => {
  const [open, setOpen] = useState(false);

  // ✅ CORRECT TOKEN

  

  // ✅ LOGOUT FUNCTION
  const handleLogout = () => {
    localStorage.clear();
    window.location.reload();
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-border/30">
      <div className="container mx-auto flex items-center justify-between h-16 px-4">

        {/* Logo */}
        <Link to="/" className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-gradient-primary flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="font-display font-bold text-xl text-foreground">
            OMNI<span className="text-gradient">DIMENSION</span>
          </span>
        </Link>

        {/* Links */}
        <div className="hidden md:flex items-center gap-8">
          {navLinks.map((l) => (
            <a key={l.label} href={l.href} className="text-sm text-muted-foreground hover:text-foreground">
              {l.label}
            </a>
          ))}
        </div>

        {/* RIGHT SIDE */}
        <div className="hidden md:flex items-center gap-3">

          {!localStorage.getItem("token") ? (
            <>
              <Link to="/login">
                <Button variant="ghost" size="sm">Log In</Button>
              </Link>

              <Link to="/signup">
                <Button size="sm">Get Started Free</Button>
              </Link>
            </>
          ) : (
            <>
              <Link to="/dashboard">
                <Button variant="ghost" size="sm">Dashboard</Button>
              </Link>

              <Button variant="outline" size="sm" onClick={handleLogout}>
                Sign Out
              </Button>
            </>
          )}

        </div>

        {/* Mobile */}
        <button className="md:hidden text-foreground" onClick={() => setOpen(!open)}>
          {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>

      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden glass border-t border-border/30"
          >
            <div className="px-4 py-4 flex flex-col gap-3">

              {navLinks.map((l) => (
                <a key={l.label} href={l.href} className="text-sm py-2" onClick={() => setOpen(false)}>
                  {l.label}
                </a>
              ))}

              {!token ? (
                <Link to="/signup">
                  <Button className="w-full mt-2">Get Started Free</Button>
                </Link>
              ) : (
                <>
                  <Link to="/dashboard">
                    <Button className="w-full mt-2">Dashboard</Button>
                  </Link>

                  <Button className="w-full" onClick={handleLogout}>
                    Sign Out
                  </Button>
                </>
              )}

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};