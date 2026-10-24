import React, { useEffect, useRef } from "react";

const GOOGLE_CLIENT_ID =
  process.env.REACT_APP_GOOGLE_CLIENT_ID ||
  // The local client id is a development convenience only. A production build
  // must provide its own id so it cannot silently use another deployment's
  // OAuth client.
  (process.env.NODE_ENV === "production"
    ? ""
    : "690196150991-39rsb4sffjvfl66jt22unp0uulhfgu5m.apps.googleusercontent.com");
const SCRIPT_ID = "google-identity-services";
// College-only account chooser by default. Set REACT_APP_GOOGLE_HOSTED_DOMAIN
// to an empty value while testing so test Gmail accounts stay selectable; the
// server still gates every sign-in by domain or TEST_STUDENT_EMAILS /
// TEST_TEACHER_EMAILS.
const HOSTED_DOMAIN = process.env.REACT_APP_GOOGLE_HOSTED_DOMAIN ?? "nitjsr.ac.in";

const GoogleSignInButton = ({ onCredential, onLoadError, disabled }) => {
  const buttonRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    if (!GOOGLE_CLIENT_ID) {
      onLoadError(
        "Google sign-in is not configured for this build. Set REACT_APP_GOOGLE_CLIENT_ID before building the frontend."
      );
      return undefined;
    }

    const renderButton = () => {
      if (cancelled || !window.google?.accounts?.id || !buttonRef.current) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: onCredential,
        auto_select: false,
        ...(HOSTED_DOMAIN ? { hosted_domain: HOSTED_DOMAIN } : {}),
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
