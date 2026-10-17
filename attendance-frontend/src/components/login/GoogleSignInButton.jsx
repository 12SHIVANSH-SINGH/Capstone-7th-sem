import React, { useEffect, useRef } from "react";

const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID || "690196150991-39rsb4sffjvfl66jt22unp0uulhfgu5m.apps.googleusercontent.com";
const SCRIPT_ID = "google-identity-services";

const GoogleSignInButton = ({ onCredential, onLoadError, disabled }) => {
  const buttonRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const renderButton = () => {
      if (cancelled || !window.google?.accounts?.id || !buttonRef.current) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: onCredential,
        hosted_domain: "nitjsr.ac.in",
        auto_select: false,
      });
      buttonRef.current.replaceChildren();
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: "outline",
        size: "large",
        text: "signin_with",
        width: buttonRef.current.offsetWidth || 320,
      });
    };

    let script = document.getElementById(SCRIPT_ID);
    if (!script) {
      script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.onload = renderButton;
      script.onerror = () => onLoadError("Google sign-in could not be loaded. Check your connection and try again.");
      document.head.appendChild(script);
    } else if (window.google?.accounts?.id) {
      renderButton();
    } else {
      script.addEventListener("load", renderButton, { once: true });
    }

    return () => {
      cancelled = true;
    };
  }, [onCredential, onLoadError]);

  return <div className={`google-sign-in ${disabled ? "google-sign-in--disabled" : ""}`} ref={buttonRef} aria-label="Sign in with Google" />;
};

export default GoogleSignInButton;
