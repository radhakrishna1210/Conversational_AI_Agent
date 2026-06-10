import { motion } from 'framer-motion';

export default function ContactHero() {
  return (
    <section className="contact-hero">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
      >
        <h1>Contact Us</h1>
        <p>
          Talk to our team about Voice AI integrations, pricing, and enterprise deployments.
          We respond within one business day.
        </p>
      </motion.div>
    </section>
  );
}
