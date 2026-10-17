import React, { createContext, useCallback, useContext, useRef, useState } from "react";

const ToastContext = createContext(null);

// const toast = useToast(); toast("Roster saved", "success");
// variants: success | error | info
export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside <ToastProvider>");
  return context.push;
};

const ICONS = { success: "✓", error: "✕", info: "i" };

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (message, variant = "info", ttl = 4200) => {
      const id = ++idRef.current;
      setToasts((current) => [...current, { id, message, variant }]);
      if (ttl > 0) window.setTimeout(() => dismiss(id), ttl);
      return id;
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="ui-toasts" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`ui-toast ui-toast--${toast.variant}`}>
            <span className="ui-toast__icon" aria-hidden="true">{ICONS[toast.variant] || ICONS.info}</span>
            <p className="ui-toast__message">{toast.message}</p>
            <button type="button" className="ui-toast__close" onClick={() => dismiss(toast.id)} aria-label="Dismiss">
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
