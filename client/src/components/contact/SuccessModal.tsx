import { Link } from 'react-router-dom';
import { CalendarCheck, RotateCcw } from 'lucide-react';
import { motion } from 'framer-motion';

type SuccessModalProps = {
  open: boolean;
  onScheduleAnother: () => void;
};

export default function SuccessModal({ open, onScheduleAnother }: SuccessModalProps) {
  if (!open) return null;

  return (
    <div className="contact-modal-backdrop" role="presentation">
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="demo-success-title"
        className="contact-success-modal"
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.25 }}
      >
        <div className="contact-success-icon">
          <CalendarCheck size={28} />
        </div>
        <h2 id="demo-success-title">Demo Scheduled Successfully</h2>
        <p>Thank you for booking a demo. Our team will contact you shortly.</p>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link to="/" className="contact-secondary-button">
            Back to Home
          </Link>
          <button type="button" className="contact-submit-button" onClick={onScheduleAnother}>
            <RotateCcw size={17} />
            Schedule Another Demo
          </button>
        </div>
      </motion.div>
    </div>
  );
}
