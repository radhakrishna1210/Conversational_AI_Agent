import { motion } from 'framer-motion';

const APP_NAME = 'OmniDimension';

export default function BookDemoHero() {
  return (
    <section className="book-demo-hero">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h1>Book a demo with {APP_NAME}</h1>
        <p>Pick a time below for a 15-minute live demo with our team.</p>
      </motion.div>
    </section>
  );
}
