import { motion } from "framer-motion";
import {
  MessageSquare, BarChart3, Zap, Users, Shield, Bot,
  Send, LineChart, Smartphone, Globe, Workflow, Brain,
} from "lucide-react";

const features = [
  {
    icon: Send,
    title: "Smart Campaigns",
    desc: "One-time, ongoing, or API-triggered campaigns with A/B testing, retry logic, and UTM tracking.",
  },
  {
    icon: MessageSquare,
    title: "Team Inbox",
    desc: "Split-panel inbox with agent assignment, bot/human toggle, session timers, and internal notes.",
  },
  {
    icon: Bot,
    title: "AI Smart Replies",
    desc: "Intent-based automation, not just keywords. AI copilot writes templates and suggests responses.",
  },
  {
    icon: LineChart,
    title: "Revenue Attribution",
    desc: "Full-funnel conversion tracking with ROI dashboards — no spreadsheet exports needed.",
  },
  {
    icon: Workflow,
    title: "Visual Flow Builder",
    desc: "Drag-and-drop automation with triggers, conditions, and multi-step sequences.",
  },
  {
    icon: BarChart3,
    title: "Deep Analytics",
    desc: "Delivery rate heatmaps, agent CSAT scores, opt-out trends, and campaign performance breakdowns.",
  },
  {
    icon: Smartphone,
    title: "Live Template Preview",
    desc: "Real-time phone mockup with Android/iOS toggle while building templates.",
  },
  {
    icon: Brain,
    title: "AI Copilot",
    desc: "Generate template copy, optimize send times, and get campaign suggestions powered by AI.",
  },
  {
    icon: Globe,
    title: "Multi-Channel",
    desc: "WhatsApp + Instagram DMs + RCS fallback for undelivered messages — all in one platform.",
  },
  {
    icon: Users,
    title: "Unlimited Team",
    desc: "No per-agent fees. Add your entire team with Admin, Agent, or Viewer roles.",
  },
  {
    icon: Shield,
    title: "Enterprise Security",
    desc: "API key rotation, webhook verification, rate limiting, and team role management.",
  },
  {
    icon: Zap,
    title: "60+ Integrations",
    desc: "Shopify, WooCommerce, Zapier, Google Sheets, HubSpot, Razorpay — plug and play.",
  },
];

export const FeaturesSection = () => (
  <section id="features" className="py-24 relative">
    <div className="absolute inset-0 bg-gradient-dark" />
    <div className="container mx-auto px-4 relative z-10">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="text-center mb-16"
      >
        <span className="text-xs font-semibold uppercase tracking-widest text-primary mb-4 block">Features</span>
        <h2 className="font-display text-4xl md:text-5xl font-bold mb-4">
          Everything competitors charge extra for,
          <br />
          <span className="text-gradient">included free.</span>
        </h2>
        <p className="text-muted-foreground max-w-xl mx-auto">
          No per-agent fees, no conversation markup, no hidden costs. Just the most powerful WhatsApp platform at a transparent price.
        </p>
      </motion.div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {features.map((f, i) => (
          <motion.div
            key={f.title}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.05 }}
            className="glass rounded-xl p-6 hover:border-primary/30 transition-all group cursor-default"
          >
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
              <f.icon className="w-5 h-5 text-primary" />
            </div>
            <h3 className="font-display font-semibold text-foreground mb-2">{f.title}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
          </motion.div>
        ))}
      </div>
    </div>
  </section>
);
