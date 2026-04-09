import { motion } from "framer-motion";
import { ShoppingBag, GraduationCap, Heart, Building2, Megaphone, Plane } from "lucide-react";

const useCases = [
  { icon: ShoppingBag, title: "E-Commerce", desc: "Abandoned cart recovery, order updates, catalog sharing, and WhatsApp payments.", metric: "3x higher conversion" },
  { icon: GraduationCap, title: "Education", desc: "Enrollment reminders, class updates, fee notifications, and student support bots.", metric: "60% less manual work" },
  { icon: Heart, title: "Healthcare", desc: "Appointment booking, prescription reminders, lab reports, and patient follow-ups.", metric: "89% patient satisfaction" },
  { icon: Building2, title: "Real Estate", desc: "Property alerts, site visit scheduling, document sharing, and lead nurturing.", metric: "2x more site visits" },
  { icon: Megaphone, title: "Marketing Agencies", desc: "Multi-client management, campaign analytics, white-label solutions, and bulk messaging.", metric: "50+ clients managed" },
  { icon: Plane, title: "Travel & Tourism", desc: "Booking confirmations, itinerary sharing, 24/7 FAQ bots, and feedback collection.", metric: "75% faster responses" },
];

export const UseCasesSection = () => (
  <section id="usecases" className="py-24 relative">
    <div className="absolute inset-0 bg-gradient-dark" />
    <div className="container mx-auto px-4 relative z-10">
      <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-16">
        <span className="text-xs font-semibold uppercase tracking-widest text-primary mb-4 block">Use Cases</span>
        <h2 className="font-display text-4xl md:text-5xl font-bold mb-4">Built for <span className="text-gradient">every industry</span></h2>
        <p className="text-muted-foreground max-w-xl mx-auto">From D2C brands to hospitals, WhaBridge powers WhatsApp communication at scale.</p>
      </motion.div>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
        {useCases.map((u, i) => (
          <motion.div key={u.title} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }}
            className="glass rounded-xl p-6 hover:border-primary/30 transition-all group">
            <div className="flex items-start justify-between mb-4">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                <u.icon className="w-5 h-5 text-primary" />
              </div>
              <span className="text-xs font-medium text-primary bg-primary/10 px-2.5 py-1 rounded-full">{u.metric}</span>
            </div>
            <h3 className="font-display font-semibold text-foreground mb-2">{u.title}</h3>
            <p className="text-sm text-muted-foreground">{u.desc}</p>
          </motion.div>
        ))}
      </div>
    </div>
  </section>
);
