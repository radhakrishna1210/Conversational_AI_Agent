import { useState, useRef } from 'react';

export default function AnnouncementBar() {
  const [isVisible, setIsVisible] = useState(true);
  const barRef = useRef<HTMLDivElement>(null);

  const handleClose = () => {
    if (barRef.current) {
      barRef.current.style.transition = 'all 0.3s ease';
      barRef.current.style.maxHeight = barRef.current.offsetHeight + 'px';
      
      requestAnimationFrame(() => {
        if (barRef.current) {
          barRef.current.style.maxHeight = '0';
          barRef.current.style.padding = '0';
          barRef.current.style.overflow = 'hidden';
          
          setTimeout(() => setIsVisible(false), 300);
        }
      });
    } else {
      setIsVisible(false);
    }
  };

  if (!isVisible) return null;

  return (
    <div className="announcement-bar" ref={barRef}>
      <span>📞 You can now buy phone numbers in OmniDimension!</span>
      <button className="btn-announcement">View Update →</button>
      <button className="close-btn" onClick={handleClose}>✕</button>
    </div>
  );
}
