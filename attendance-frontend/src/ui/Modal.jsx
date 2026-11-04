import React, { useEffect } from "react";

const Modal = ({ open, title, subtitle, onClose, children, footer, wide = false }) => {
  useEffect(() => {
    if (!open) return undefined;
    const handleKey = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", handleKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="ui-modal" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose?.();
    }}>
      <div className={`ui-modal__dialog ${wide ? "ui-modal__dialog--wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby="ui-modal-title">
        <header className="ui-modal__head">
          <div>
            <h2 id="ui-modal-title" className="ui-modal__title">{title}</h2>
            {subtitle && <p className="ui-modal__sub">{subtitle}</p>}
          </div>
          <button type="button" className="ui-icon-btn" onClick={onClose} aria-label="Close dialog">×</button>
        </header>
        <div className="ui-modal__body">{children}</div>
        {footer && <footer className="ui-modal__footer">{footer}</footer>}
      </div>
    </div>
  );
};

export default Modal;
