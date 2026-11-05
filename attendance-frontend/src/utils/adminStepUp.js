import axios from "axios";
import {
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import SERVER_URL from "../config/api";

const requestConfig = { withCredentials: true };

export const passkeysSupported = () =>
  typeof window !== "undefined" &&
  typeof window.PublicKeyCredential !== "undefined" &&
  Boolean(navigator?.credentials);

const optionsFrom = (response) => {
  const options = response?.data?.options;
  if (!options) throw new Error("The server did not return passkey options.");
  return options;
};

export const registerAdminPasskey = async () => {
  const options = optionsFrom(
    await axios.post(
      `${SERVER_URL}/admin/webauthn/register/options`,
      null,
      requestConfig
    )
  );
  const response = await startRegistration({ optionsJSON: options });
  const verified = await axios.post(
    `${SERVER_URL}/admin/webauthn/register/verify`,
    { response },
    requestConfig
  );
  return verified.data;
};

export const approveAdminAction = async () => {
  const options = optionsFrom(
    await axios.post(
      `${SERVER_URL}/admin/webauthn/step-up/options`,
      null,
      requestConfig
    )
  );
  const response = await startAuthentication({ optionsJSON: options });
  await axios.post(
    `${SERVER_URL}/admin/webauthn/step-up/verify`,
    { response },
    requestConfig
  );
};

/**
 * Retry one destructive admin request after a fresh passkey assertion.
 * A 428 means the session is valid but the action needs step-up; any other
 * failure is passed straight through so callers keep their normal messaging.
 */
export const withAdminStepUp = async (action) => {
  try {
    return await action();
  } catch (error) {
    if (error?.response?.status !== 428) throw error;
    await approveAdminAction();
    return action();
  }
};

export const describePasskeyError = (error, fallback) => {
  const code = error?.response?.data?.code;
  if (code === "passkey_not_enrolled") {
    return "No passkey is registered. Open Security and register one first.";
  }
  if (error?.name === "NotAllowedError" || error?.name === "AbortError") {
    return "Passkey approval was cancelled or timed out.";
  }
  if (error?.name === "InvalidStateError") {
    return "This passkey is already registered.";
  }
  if (error?.name === "SecurityError") {
    return "Passkeys need HTTPS (or localhost) and a matching server origin.";
  }
  return error?.response?.data?.message || error?.message || fallback;
};
