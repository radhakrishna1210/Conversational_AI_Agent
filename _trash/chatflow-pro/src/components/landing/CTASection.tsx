import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

export const CTASection = () => (
  <section className="py-24 relative overflow-hidden">
    <div className="absolute inset-0 bg-gradient-dark" />
    <div className="absolute inset-0 bg-primary/[0.03]" />
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-full bg-primary/10 blur-[150px]" />
    
    <div className="container mx-auto px-4 relative z-10">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="max-w-3xl mx-auto text-center"
      >
        <h2 className="font-display text-4xl md:text-5xl font-bold mb-6">
          Ready to stop overpaying
          <br />
          <span className="text-gradient">for WhatsApp API?</span>
        </h2>
        <p className="text-lg text-muted-foreground mb-10 max-w-xl mx-auto">
          Join thousands of businesses that switched from Wati and Interakt to get better features at a fraction of the cost.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link to="/dashboard">
            <Button size="lg" className="bg-gradient-primary text-primary-foreground font-semibold shadow-glow hover:opacity-90 h-14 px-10 text-base">
              Start Your Free Trial
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          </Link>
        </div>
        <p className="text-xs text-muted-foreground mt-4">14-day free trial · No credit card required · Setup in 5 minutes</p>
      </motion.div>
    </div>
  </section>
);
