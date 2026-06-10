import { Clock, Monitor } from 'lucide-react';
import BookDemoCalendar from './BookDemoCalendar';
import BookDemoTimeSlots from './BookDemoTimeSlots';

const APP_NAME = 'OmniDimension';

type BookDemoCardProps = {
  selectedDate: Date | null;
  visibleMonth: Date;
  selectedTime: string;
  isConfirmed: boolean;
  onMonthChange: (date: Date) => void;
  onDateSelect: (date: Date) => void;
  onTimeSelect: (time: string) => void;
  onConfirm: () => void;
};

export default function BookDemoCard({
  selectedDate,
  visibleMonth,
  selectedTime,
  isConfirmed,
  onMonthChange,
  onDateSelect,
  onTimeSelect,
  onConfirm,
}: BookDemoCardProps) {
  const showTimeSlots = Boolean(selectedDate);

  return (
    <div className="book-demo-card">
      <span className="book-demo-calendly-badge">Powered by Calendly</span>

      <div className="book-demo-card-panels">
        <aside className="book-demo-panel-left">
          <h2>Meet with {APP_NAME}</h2>
          <div className="book-demo-meta-row">
            <Clock size={16} />
            <span>15 min</span>
          </div>
          <div className="book-demo-meta-row">
            <Monitor size={16} />
            <span>Web conferencing details provided upon confirmation.</span>
          </div>
        </aside>

        <div className="book-demo-panel-right">
          <h3>Select a Date &amp; Time</h3>
          <div className="book-demo-panel-right-inner">
            <BookDemoCalendar
              selectedDate={selectedDate}
              visibleMonth={visibleMonth}
              onMonthChange={onMonthChange}
              onDateSelect={onDateSelect}
            />
            <BookDemoTimeSlots
              visible={showTimeSlots}
              selectedDate={selectedDate}
              selectedTime={selectedTime}
              onTimeSelect={onTimeSelect}
              onConfirm={onConfirm}
              isConfirmed={isConfirmed}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
