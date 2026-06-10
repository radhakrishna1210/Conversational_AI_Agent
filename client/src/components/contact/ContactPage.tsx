import { motion } from 'framer-motion';
import ContactForm from './ContactForm';
import ContactHero from './ContactHero';

export default function ContactPage() {
  return (
    <main className="contact-page-shell">
      <div className="contact-page-glow" aria-hidden="true" />

      <ContactHero />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.1 }}
      >
        <ContactForm />
      </motion.div>
    </main>
  );
}
