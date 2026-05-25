import { useEffect, useRef } from 'react';

export function useFocusTrap(isOpen) {
  const ref = useRef(null);
  
  useEffect(() => {
    if (!isOpen || !ref.current) return;
    
    const focusable = ref.current.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        // Assume modal close is handled elsewhere or via passing a close function
        // but typically focus traps just trap Tab. Let caller handle Escape if they want
      }
      if (e.key !== 'Tab') return;
      
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    
    // Focus the first element slightly after mount to avoid interfering with render cycle
    setTimeout(() => first.focus(), 10);
    
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);
  
  return ref;
}
