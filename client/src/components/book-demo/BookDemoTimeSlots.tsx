import { motion, AnimatePresence } from 'framer-motion';

type BookDemoTimeSlotsProps = {
  visible: boolean;
  selectedDate: Date | null;
  selectedTime: string;
  onTimeSelect: (time: string) => void;
  onConfirm: () => void;
  isConfirmed: boolean;
};

const TIME_SLOTS = (() => {
  const slots: string[] = [];
  for (let hour = 9; hour <= 17; hour++) {
    for (const minute of [0, 30]) {
      if (hour === 17 && minute === 30) break;
      const period = hour >= 12 ? 'PM' : 'AM';
      const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
      const minuteStr = minute === 0 ? '00' : '30';
      slots.push(`${displayHour}:${minuteStr} ${period}`);
    }
  }
  return slots;
})();

export default function BookDemoTimeSlots({
  visible,
  selectedDate,
  selectedTime,
  onTimeSelect,
  onConfirm,
  isConfirmed,
}: BookDemoTimeSlotsProps) {
  const dateLabel = selectedDate
    ? selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    : '';

  return (
    <AnimatePresence>
      {visible && selectedDate && (
        <motion.div
          className="book-demo-timeslots"
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 40 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        >
          {isConfirmed ? (
            <motion.div
              className="book-demo-success"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.35 }}
            >
              <motion.div
                className="book-demo-success-check"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.1 }}
              >
                ✓
              </motion.div>
              <h3>You&apos;re booked!</h3>
              <p>Check your email for the meeting link.</p>
            </motion.div>
          ) : (
            <>
              <p className="book-demo-timeslots-date">{dateLabel}</p>
              <div className="book-demo-timeslots-list">
                {TIME_SLOTS.map((time) => (
                  <button
                    key={time}
                    type="button"
                    className={`book-demo-timeslot ${selectedTime === time ? 'is-selected' : ''}`}
                    onClick={() => onTimeSelect(time)}
                    aria-pressed={selectedTime === time}
                  >
                    {time}
                  </button>
                ))}
              </div>
              {selectedTime && (
                <motion.button
                  type="button"
                  className="book-demo-confirm-btn"
                  onClick={onConfirm}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  Confirm booking
                </motion.button>
              )}
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
