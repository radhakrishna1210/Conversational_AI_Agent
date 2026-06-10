import { ChevronLeft, ChevronRight } from 'lucide-react';

type BookingCalendarProps = {
  selectedDate: Date | null;
  visibleMonth: Date;
  onMonthChange: (date: Date) => void;
  onDateSelect: (date: Date) => void;
};

const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

export default function BookingCalendar({
  selectedDate,
  visibleMonth,
  onMonthChange,
  onDateSelect,
}: BookingCalendarProps) {
  const today = startOfDay(new Date());
  const monthStart = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
  const monthEnd = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0);
  const leadingBlanks = monthStart.getDay();

  const days = Array.from({ length: leadingBlanks + monthEnd.getDate() }, (_, index) => {
    if (index < leadingBlanks) return null;
    return new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), index - leadingBlanks + 1);
  });

  const monthLabel = visibleMonth.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  const moveMonth = (direction: number) => {
    onMonthChange(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + direction, 1));
  };

  return (
    <section className="contact-panel" aria-label="Select a demo date">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#00d4c8]">Step 1</p>
          <h2 className="mt-2 text-xl font-bold text-white">Choose a date</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="contact-icon-button"
            onClick={() => moveMonth(-1)}
            aria-label="Previous month"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            className="contact-icon-button"
            onClick={() => moveMonth(1)}
            aria-label="Next month"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div className="mb-5 text-center text-base font-semibold text-white">{monthLabel}</div>

      <div className="grid grid-cols-7 gap-2 text-center text-xs font-semibold uppercase text-[#7f899a]">
        {weekdays.map((day) => (
          <div key={day}>{day}</div>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-7 gap-2">
        {days.map((day, index) => {
          if (!day) return <span key={`empty-${index}`} aria-hidden="true" />;

          const isDisabled = startOfDay(day) < today || day.getDay() === 0;
          const isSelected = selectedDate ? sameDay(day, selectedDate) : false;

          return (
            <button
              key={day.toISOString()}
              type="button"
              disabled={isDisabled}
              onClick={() => onDateSelect(day)}
              className={`contact-date-button ${isSelected ? 'is-selected' : ''}`}
              aria-pressed={isSelected}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>
    </section>
  );
}
