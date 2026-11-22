import axios from "axios";
import SERVER_URL from "../config/api";
import { fingerprintDevicePublicKey, getDevicePublicKey } from "./deviceKey";

/**
 * Ask the server about this browser, not the student in general. The approved
 * phone can keep working while a different browser waits for review; that is
 * why the fingerprint is sent when one exists.
 */
export const loadDeviceStatus = async () => {
  const publicKeyJwk = await getDevicePublicKey();
  const fingerprint = publicKeyJwk ? await fingerprintDevicePublicKey(publicKeyJwk) : "";
  const response = await axios.get(`${SERVER_URL}/device-bindings/status`, {
    withCredentials: true,
    params: fingerprint ? { fingerprint } : undefined,
  });

  return {
    status: response.data?.status || "unbound",
    pendingReview: response.data?.pendingReview === true,
    currentDeviceApproved: response.data?.currentDeviceApproved === true,
  };
};

export default loadDeviceStatus;
