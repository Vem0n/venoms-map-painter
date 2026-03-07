/**
 * Toast — Simple auto-dismissing notification overlay.
 */

import React, { useEffect, useState } from 'react';
import { theme } from '../theme';

interface ToastProps {
  message: string;
  /** Duration in ms before auto-dismiss (default 3000) */
  duration?: number;
  onDismiss: () => void;
}

export default function Toast({ message, duration = 3000, onDismiss }: ToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 300); // Wait for fade-out
    }, duration);
    return () => clearTimeout(timer);
  }, [duration, onDismiss]);

  return (
    <div style={{
      position: 'fixed',
      bottom: 72,
      left: '50%',
      transform: `translateX(-50%) translateY(${visible ? '0' : '20px'})`,
      zIndex: 2000,
      pointerEvents: 'none',
      opacity: visible ? 1 : 0,
      transition: 'opacity 0.3s ease, transform 0.3s ease',
    }}>
      <div style={{
        background: 'rgba(13, 17, 23, 0.95)',
        backdropFilter: 'blur(8px)',
        border: `1px solid ${theme.border.default}`,
        borderRadius: theme.radius.md,
        padding: '10px 20px',
        boxShadow: theme.shadow.dropdown,
        color: theme.text.primary,
        fontSize: theme.font.sizeMd,
        fontFamily: theme.font.family,
        fontWeight: 500,
        whiteSpace: 'nowrap',
      }}>
        {message}
      </div>
    </div>
  );
}
