import { Bell } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface NotificationBellProps {
  unreadCount?: number;
  onClick: () => void;
  active?: boolean;
}

export function NotificationBell({ unreadCount = 0, onClick, active = false }: NotificationBellProps) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn(
        'relative text-muted-foreground hover:text-foreground transition-colors',
        active && 'text-foreground bg-muted/50'
      )}
      onClick={onClick}
      aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
    >
      <Bell className="w-4 h-4" />

      <AnimatePresence>
        {unreadCount > 0 && (
          <motion.span
            key="badge"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center leading-none pointer-events-none"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </motion.span>
        )}
      </AnimatePresence>
    </Button>
  );
}
