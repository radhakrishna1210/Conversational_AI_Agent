import { useState } from 'react';
import { motion } from 'framer-motion';
import BookDemoCard from './BookDemoCard';
import BookDemoFooter from './BookDemoFooter';
import BookDemoHero from './BookDemoHero';
import WhatWeCover from './WhatWeCover';

export default function BookDemoPage() {
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [visibleMonth, setVisibleMonth] = useState(() => new Date());
  const [selectedTime, setSelectedTime] = useState('');
  const [isConfirmed, setIsConfirmed] = useState(false);

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
    setSelectedTime('');
    setIsConfirmed(false);
  };

  const handleConfirm = () => {
    if (!selectedDate || !selectedTime) return;
    setIsConfirmed(true);
  };

  return (
    <main className="book-demo-page">
      <div className="book-demo-glow" aria-hidden="true" />

      <BookDemoHero />

      <motion.div
        className="book-demo-card-wrap"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.08 }}
      >
        <BookDemoCard
          selectedDate={selectedDate}
          visibleMonth={visibleMonth}
          selectedTime={selectedTime}
          isConfirmed={isConfirmed}
          onMonthChange={setVisibleMonth}
          onDateSelect={handleDateSelect}
          onTimeSelect={setSelectedTime}
          onConfirm={handleConfirm}
        />
      </motion.div>

      <WhatWeCover />
      <BookDemoFooter />
    </main>
  );
}
