import { Clock } from 'lucide-react';

type TimeSlotsProps = {
  selectedDate: Date | null;
  selectedTime: string;
  onTimeSelect: (time: string) => void;
};

const slots = [
  { time: '10:00 AM', disabled: false },
  { time: '10:30 AM', disabled: false },
  { time: '11:00 AM', disabled: false },
  { time: '11:30 AM', disabled: true },
  { time: '2:00 PM', disabled: false },
  { time: '2:30 PM', disabled: false },
  { time: '3:00 PM', disabled: false },
  { time: '4:00 PM', disabled: false },
];

export default function TimeSlots({ selectedDate, selectedTime, onTimeSelect }: TimeSlotsProps) {
  const label = selectedDate
    ? selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    : 'Select a date to view slots';

  return (
    <section className="contact-panel" aria-label="Select a demo time">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#00d4c8]">Step 2</p>
        <h2 className="mt-2 text-xl font-bold text-white">Available times</h2>
        <p className="mt-2 text-sm text-[#9aa4b5]">{label}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
        {slots.map((slot) => {
          const isSelected = selectedTime === slot.time;
          return (
            <button
              key={slot.time}
              type="button"
              disabled={!selectedDate || slot.disabled}
              onClick={() => onTimeSelect(slot.time)}
              className={`contact-slot-button ${isSelected ? 'is-selected' : ''}`}
              aria-pressed={isSelected}
            >
              <Clock size={16} />
              <span>{slot.time}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
