import React, { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import './ToastHost.css';

export interface ToastPayload {
  title?: string;
  message: string;
}

const ToastHost: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState<ToastPayload | null>(null);

  useEffect(() => {
    const st = location.state as { toast?: ToastPayload } | null;
    if (st?.toast?.message) {
      setPayload(st.toast);
      setOpen(true);
    } else {
      setOpen(false);
      setPayload(null);
    }
  }, [location.pathname, location.search, location.hash, location.state, location.key]);

  const dismiss = useCallback(() => {
    setOpen(false);
    setPayload(null);
    navigate(
      { pathname: location.pathname, search: location.search, hash: location.hash },
      { replace: true, state: {} }
    );
  }, [navigate, location.pathname, location.search, location.hash]);

  if (!open || !payload) {
    return null;
  }

  return (
    <div
      className="toast-host-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="toast-host-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) dismiss();
      }}
    >
      <div className="toast-host-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="toast-host-close" onClick={dismiss} aria-label="Закрыть">
          ×
        </button>
        <h2 id="toast-host-title" className="toast-host-title">
          {payload.title ?? 'Готово'}
        </h2>
        <p className="toast-host-message">{payload.message}</p>
        <button type="button" className="toast-host-btn" onClick={dismiss}>
          Понятно
        </button>
      </div>
    </div>
  );
};

export default ToastHost;
