import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Bell, X, CheckCheck, Trash2, RefreshCw,
  Info, CheckCircle2, AlertTriangle, XCircle,
  Megaphone, MessageSquare, Settings2, ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNotifications } from '@/hooks/useNotifications';
import type { Notification } from '@/lib/notificationsApi';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

// ─── Types ────────────────────────────────────────────────────────────────────
type FilterType = 'ALL' | 'UNREAD' | 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'CAMPAIGN' | 'MESSAGE' | 'SYSTEM';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getTypeConfig(type: Notification['type']) {
  const map = {
    INFO:     { icon: Info,          color: 'text-blue-400',   bg: 'bg-blue-500/10',   dot: 'bg-blue-400'   },
    SUCCESS:  { icon: CheckCircle2,  color: 'text-green-400',  bg: 'bg-green-500/10',  dot: 'bg-green-400'  },
    WARNING:  { icon: AlertTriangle, color: 'text-amber-400',  bg: 'bg-amber-500/10',  dot: 'bg-amber-400'  },
    ERROR:    { icon: XCircle,       color: 'text-red-400',    bg: 'bg-red-500/10',    dot: 'bg-red-400'    },
    CAMPAIGN: { icon: Megaphone,     color: 'text-purple-400', bg: 'bg-purple-500/10', dot: 'bg-purple-400' },
    MESSAGE:  { icon: MessageSquare, color: 'text-cyan-400',   bg: 'bg-cyan-500/10',   dot: 'bg-cyan-400'   },
    SYSTEM:   { icon: Settings2,     color: 'text-slate-400',  bg: 'bg-slate-500/10',  dot: 'bg-slate-400'  },
  };
  return map[type] ?? map.INFO;
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const diff = now - new Date(dateStr).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

// ─── Single notification row ──────────────────────────────────────────────────
function NotificationItem({
  notification,
  onMarkRead,
  onDelete,
}: {
  notification: Notification;
  onMarkRead: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const cfg = getTypeConfig(notification.type);
  const Icon = cfg.icon;
  const [hovered, setHovered] = useState(false);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.18 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        'relative flex gap-3 px-4 py-3.5 cursor-pointer transition-colors duration-150',
        !notification.read
          ? 'bg-white/[0.03] hover:bg-white/[0.06]'
          : 'hover:bg-white/[0.025]'
      )}
      onClick={() => !notification.read && onMarkRead(notification.id)}
    >
      {/* Unread left bar */}
      {!notification.read && (
        <span className={cn('absolute left-0 top-0 bottom-0 w-[3px] rounded-r', cfg.dot)} />
      )}

      {/* Icon */}
      <div className={cn('mt-0.5 w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center', cfg.bg)}>
        <Icon className={cn('w-4 h-4', cfg.color)} />
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0 pr-10">
        <div className="flex items-start justify-between gap-2">
          <p className={cn(
            'text-sm leading-tight truncate',
            notification.read ? 'text-muted-foreground' : 'text-foreground font-medium'
          )}>
            {notification.title}
          </p>
          <span className="text-[10px] text-muted-foreground/50 flex-shrink-0 mt-0.5 whitespace-nowrap">
            {timeAgo(notification.createdAt)}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
          {notification.message}
        </p>
        {notification.actionText && notification.actionLink && (
          <a
            href={notification.actionLink}
            onClick={(e) => e.stopPropagation()}
            className={cn('inline-flex items-center gap-1 text-xs mt-1.5 font-medium hover:underline', cfg.color)}
          >
            {notification.actionText}
            <ChevronRight className="w-3 h-3" />
          </a>
        )}
      </div>

      {/* Hover actions */}
      <AnimatePresence>
        {hovered && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
            className="absolute right-3 top-3 flex items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            {!notification.read && (
              <button
                title="Mark as read"
                onClick={(e) => { e.stopPropagation(); onMarkRead(notification.id); }}
                className="w-6 h-6 rounded flex items-center justify-center bg-background/80 hover:bg-background text-muted-foreground hover:text-foreground transition-colors"
              >
                <CheckCheck className="w-3 h-3" />
              </button>
            )}
            <button
              title="Delete"
              onClick={(e) => { e.stopPropagation(); onDelete(notification.id); }}
              className="w-6 h-6 rounded flex items-center justify-center bg-background/80 hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-muted/30 flex items-center justify-center mb-4">
        <Bell className="w-6 h-6 text-muted-foreground/40" />
      </div>
      <p className="text-sm font-medium text-muted-foreground">
        {filtered ? 'No matching notifications' : "You're all caught up"}
      </p>
      <p className="text-xs text-muted-foreground/50 mt-1">
        {filtered ? 'Try a different filter' : "We'll notify you when something happens"}
      </p>
    </div>
  );
}

// ─── Filter pill ──────────────────────────────────────────────────────────────
function FilterPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors whitespace-nowrap',
        active
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      {label}
    </button>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────
export function NotificationPanel({
  open,
  onClose,
  onUnreadCountChange,
}: {
  open: boolean;
  onClose: () => void;
  onUnreadCountChange?: (count: number) => void;
}) {
  const {
    notifications, unreadCount, loading, error,
    markRead, markAllRead, deleteOne, clearAll, refresh,
  } = useNotifications();

  const [filter, setFilter] = useState<FilterType>('ALL');

  // Notify parent of unread count changes (for badge)
  useEffect(() => {
    onUnreadCountChange?.(unreadCount);
  }, [unreadCount, onUnreadCountChange]);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handle = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [open, onClose]);

  const FILTERS: { key: FilterType; label: string }[] = [
    { key: 'ALL',      label: 'All'       },
    { key: 'UNREAD',   label: 'Unread'    },
    { key: 'CAMPAIGN', label: 'Campaigns' },
    { key: 'MESSAGE',  label: 'Messages'  },
    { key: 'SYSTEM',   label: 'System'    },
    { key: 'ERROR',    label: 'Errors'    },
  ];

  const filtered = notifications.filter((n) => {
    if (filter === 'ALL')    return true;
    if (filter === 'UNREAD') return !n.read;
    return n.type === filter;
  });

  return (
    <>
      {/* Backdrop — click to close */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-40 bg-black/30"
            onMouseDown={onClose}
          />
        )}
      </AnimatePresence>

      {/* Slide-in panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 340, damping: 32 }}
            // Stop clicks inside the panel from hitting the backdrop
            onMouseDown={(e) => e.stopPropagation()}
            className="fixed top-0 right-0 bottom-0 z-50 w-[380px] flex flex-col bg-[#0f1117] border-l border-border/50 shadow-2xl"
          >
            {/* ── Header ── */}
            <div className="flex-shrink-0 px-5 pt-5 pb-3">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Bell className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">Notifications</h2>
                    {unreadCount > 0 && (
                      <p className="text-[11px] text-muted-foreground">{unreadCount} unread</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost" size="icon"
                    className="w-7 h-7 text-muted-foreground hover:text-foreground"
                    onClick={refresh}
                    title="Refresh"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost" size="icon"
                    className="w-7 h-7 text-muted-foreground hover:text-foreground"
                    onClick={onClose}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Filter pills */}
              <div className="flex items-center gap-1 overflow-x-auto pb-1 mb-3 scrollbar-none">
                {FILTERS.map((f) => (
                  <FilterPill
                    key={f.key}
                    label={f.label}
                    active={filter === f.key}
                    onClick={() => setFilter(f.key)}
                  />
                ))}
              </div>

              {/* Bulk actions */}
              {notifications.length > 0 && (
                <div className="flex items-center gap-3">
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllRead}
                      className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                      Mark all read
                    </button>
                  )}
                  {notifications.length > 0 && (
                    <>
                      {unreadCount > 0 && <span className="text-muted-foreground/30 text-xs">·</span>}
                      <button
                        onClick={clearAll}
                        className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Clear all
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            <Separator className="opacity-20" />

            {/* ── Content ── */}
            <ScrollArea className="flex-1">
              {loading ? (
                // Skeleton loader
                <div className="flex flex-col gap-0">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="flex gap-3 px-4 py-3.5">
                      <div className="w-8 h-8 rounded-lg bg-muted/30 animate-pulse flex-shrink-0" />
                      <div className="flex-1 space-y-2 py-0.5">
                        <div className="h-3 bg-muted/30 rounded animate-pulse w-3/4" />
                        <div className="h-2.5 bg-muted/20 rounded animate-pulse w-full" />
                        <div className="h-2.5 bg-muted/15 rounded animate-pulse w-2/3" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : error ? (
                <div className="flex flex-col items-center justify-center py-12 px-6 text-center gap-3">
                  <XCircle className="w-8 h-8 text-red-400/50" />
                  <p className="text-sm text-muted-foreground">{error}</p>
                  <Button variant="outline" size="sm" onClick={refresh}>Try again</Button>
                </div>
              ) : filtered.length === 0 ? (
                <EmptyState filtered={filter !== 'ALL'} />
              ) : (
                <AnimatePresence initial={false}>
                  {filtered.map((n, i) => (
                    <div key={n.id}>
                      <NotificationItem
                        notification={n}
                        onMarkRead={markRead}
                        onDelete={deleteOne}
                      />
                      {i < filtered.length - 1 && <Separator className="opacity-10" />}
                    </div>
                  ))}
                </AnimatePresence>
              )}
            </ScrollArea>

            {/* ── Footer ── */}
            <div className="flex-shrink-0 px-5 py-3 border-t border-border/20">
              <p className="text-[11px] text-muted-foreground/40 text-center">
                {notifications.length > 0
                  ? `Showing ${filtered.length} of ${notifications.length} notifications`
                  : 'No notifications yet'}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
