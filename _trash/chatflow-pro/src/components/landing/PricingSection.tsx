import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Check, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

const plans = [
  {
    name: "Starter",
    price: "₹799",
    period: "/month",
    desc: "Perfect for small businesses getting started with WhatsApp API",
    features: [
      "1 WhatsApp number",
      "Up to 5 team members",
      "1,000 free conversations/mo",
      "Basic chatbot builder",
      "Team inbox",
      "Template manager",
      "Email support",
    ],
    cta: "Start Free Trial",
    popular: false,
  },
  {
    name: "Growth",
    price: "₹2,499",
    period: "/month",
    desc: "For growing teams that need campaigns, automation and analytics",
    features: [
      "2 WhatsApp numbers",
      "Unlimited team members",
      "5,000 free conversations/mo",
      "AI Smart Replies & Copilot",
      "Campaign A/B testing",
      "Visual flow builder",
      "Revenue attribution dashboard",
      "RCS fallback",
      "Priority support",
    ],
    cta: "Start Free Trial",
    popular: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    desc: "For large teams with complex workflows and compliance needs",
    features: [
      "Unlimited numbers",
      "Unlimited team members",
      "Custom conversation volume",
      "Custom AI model training",
      "Dedicated account manager",
      "SSO & audit logs",
      "Custom integrations",
      "SLA guarantee",
      "On-call support",
    ],
    cta: "Talk to Sales",
    popular: false,
  },
];

export const PricingSection = () => (
  <section id="pricing" className="py-24 relative">
    <div className="absolute inset-0 bg-gradient-dark" />
    <div className="container mx-auto px-4 relative z-10">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="text-center mb-16"
      >
        <span className="text-xs font-semibold uppercase tracking-widest text-primary mb-4 block">Pricing</span>
        <h2 className="font-display text-4xl md:text-5xl font-bold mb-4">
          Transparent pricing.
          <br />
          <span className="text-gradient">Zero hidden costs.</span>
        </h2>
        <p className="text-muted-foreground max-w-xl mx-auto">
          Unlike Wati's 20% markup or Interakt's per-agent charges, we pass through Meta's conversation pricing at cost.
        </p>
      </motion.div>

      <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
        {plans.map((p, i) => (
          <motion.div
            key={p.name}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1 }}
            className={`rounded-2xl p-8 relative ${
              p.popular
                ? "bg-gradient-card border-2 border-primary/40 shadow-glow"
                : "glass"
            }`}
          >
            {p.popular && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-gradient-primary text-xs font-semibold text-primary-foreground">
                Most Popular
              </div>
            )}
            <h3 className="font-display text-xl font-bold text-foreground mb-1">{p.name}</h3>
            <p className="text-sm text-muted-foreground mb-6">{p.desc}</p>
            <div className="mb-6">
              <span className="font-display text-4xl font-bold text-foreground">{p.price}</span>
              <span className="text-muted-foreground text-sm">{p.period}</span>
            </div>
            <ul className="space-y-3 mb-8">
              {p.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Check className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <Link to="/dashboard">
              <Button
                className={`w-full ${
                  p.popular
                    ? "bg-gradient-primary text-primary-foreground font-semibold shadow-glow hover:opacity-90"
                    : "bg-secondary text-foreground hover:bg-secondary/80"
                }`}
              >
                {p.cta}
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  </section>
);
