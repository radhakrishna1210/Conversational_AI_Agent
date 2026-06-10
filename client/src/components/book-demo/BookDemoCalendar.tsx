import { ChevronLeft, ChevronRight } from 'lucide-react';

type BookDemoCalendarProps = {
  selectedDate: Date | null;
  visibleMonth: Date;
  onMonthChange: (date: Date) => void;
  onDateSelect: (date: Date) => void;
};

const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const isWeekend = (date: Date) => {
  const day = date.getDay();
  return day === 0 || day === 6;
};

export default function BookDemoCalendar({
  selectedDate,
  visibleMonth,
  onMonthChange,
  onDateSelect,
}: BookDemoCalendarProps) {
  const today = startOfDay(new Date());
  const monthStart = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
  const monthEnd = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0);

  // Monday-first grid: convert Sunday=0 to Monday=0 index
  const mondayOffset = (monthStart.getDay() + 6) % 7;
  const days = Array.from({ length: mondayOffset + monthEnd.getDate() }, (_, index) => {
    if (index < mondayOffset) return null;
    return new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), index - mondayOffset + 1);
  });

  const monthLabel = visibleMonth.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  const moveMonth = (direction: number) => {
    onMonthChange(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + direction, 1));
  };

  return (
    <div className="book-demo-calendar">
      <div className="book-demo-calendar-nav">
        <button
          type="button"
          className="book-demo-cal-arrow"
          onClick={() => moveMonth(-1)}
          aria-label="Previous month"
        >
          <ChevronLeft size={18} />
        </button>
        <span className="book-demo-cal-month">{monthLabel}</span>
        <button
          type="button"
          className="book-demo-cal-arrow"
          onClick={() => moveMonth(1)}
          aria-label="Next month"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="book-demo-cal-weekdays">
        {weekdays.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>

      <div className="book-demo-cal-grid">
        {days.map((day, index) => {
          if (!day) return <span key={`empty-${index}`} className="book-demo-cal-cell empty" aria-hidden="true" />;

          const isPast = startOfDay(day) < today;
          const isDisabled = isPast || isWeekend(day);
          const isToday = sameDay(day, today);
          const isSelected = selectedDate ? sameDay(day, selectedDate) : false;

          return (
            <button
              key={day.toISOString()}
              type="button"
              disabled={isDisabled}
              onClick={() => onDateSelect(day)}
              className={[
                'book-demo-cal-cell',
                'book-demo-cal-day',
                isSelected ? 'is-selected' : '',
                isToday ? 'is-today' : '',
                isDisabled ? 'is-disabled' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-pressed={isSelected}
              aria-label={day.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            >
              <span className="book-demo-cal-num">{day.getDate()}</span>
              {isToday && !isSelected && <span className="book-demo-cal-today-dot" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
