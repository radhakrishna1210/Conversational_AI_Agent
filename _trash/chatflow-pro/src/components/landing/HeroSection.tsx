import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Play, CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";

const stats = [
  { value: "50K+", label: "Messages/day" },
  { value: "99.9%", label: "Uptime" },
  { value: "0%", label: "Hidden Markup" },
  { value: "<2s", label: "Avg Response" },
];

const checks = [
  "No hidden conversation markup",
  "AI-powered smart replies",
  "Revenue attribution built-in",
  "Unlimited team members",
];

export const HeroSection = () => (
  <section className="relative pt-32 pb-20 overflow-hidden">
    {/* Background effects */}
    <div className="absolute inset-0 bg-gradient-dark" />
    <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[600px] rounded-full bg-primary/5 blur-[120px]" />
    <div className="absolute top-20 right-10 w-2 h-2 rounded-full bg-primary animate-pulse-glow" />
    <div className="absolute top-40 left-20 w-1.5 h-1.5 rounded-full bg-primary/60 animate-pulse-glow" style={{ animationDelay: "1s" }} />

    <div className="container mx-auto px-4 relative z-10">
      <div className="max-w-4xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/5 mb-8">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="text-xs font-medium text-primary">Official Meta WhatsApp Business API Partner</span>
          </div>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1 }}
          className="font-display text-5xl md:text-7xl font-bold leading-[1.1] mb-6"
        >
          The WhatsApp Platform
          <br />
          <span className="text-gradient">Built for Revenue</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-8"
        >
          Send campaigns, automate conversations, and track every rupee of ROI — with zero hidden markup. 
          The only WhatsApp API platform with built-in revenue attribution.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12"
        >
          <Link to="/dashboard">
            <Button size="lg" className="bg-gradient-primary text-primary-foreground font-semibold shadow-glow hover:opacity-90 transition-all h-12 px-8 text-base">
              Start Free — No Card Required
              <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </Link>
          <Button size="lg" variant="outline" className="border-border/50 text-foreground hover:bg-secondary h-12 px-8 text-base">
            <Play className="mr-2 w-4 h-4" />
            Watch Demo
          </Button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-xl mx-auto mb-16"
        >
          {checks.map((c) => (
            <div key={c} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CheckCircle2 className="w-3.5 h-3.5 text-primary flex-shrink-0" />
              <span>{c}</span>
            </div>
          ))}
        </motion.div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-6"
        >
          {stats.map((s) => (
            <div key={s.label} className="glass rounded-xl p-5 text-center">
              <div className="font-display text-2xl md:text-3xl font-bold text-gradient mb-1">{s.value}</div>
              <div className="text-xs text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  </section>
);
