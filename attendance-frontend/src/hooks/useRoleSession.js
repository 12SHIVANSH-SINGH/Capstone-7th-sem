/**
 * Shared signed-in session loader for the newer pages.
 *
 * The API remains the source of truth. This hook only redirects a signed-out
 * browser and keeps role-specific pages from rendering another role's data.
 */
import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import SERVER_URL from "../config/api";
import { dashboardPath } from "../utils/auth";

const messageFor = (error, fallback) =>
  error?.response?.data?.message || error?.message || fallback;

const useRoleSession = (allowedRoles = []) => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const allowedKey = allowedRoles.join("|");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await axios.get(`${SERVER_URL}/islogin`, { withCredentials: true });
        if (cancelled) return;
        const nextUser = response.data?.user || null;
        if (!nextUser) {
          navigate("/login");
          return;
        }
        if (allowedKey && !allowedKey.split("|").includes(nextUser.role)) {
          navigate(dashboardPath(nextUser.role));
          return;
        }
        setUser(nextUser);
      } catch (requestError) {
        if (cancelled) return;
        if (requestError?.response?.status === 401) {
          navigate("/login");
          return;
        }
        setError(messageFor(requestError, "Could not confirm your session."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [allowedKey, navigate]);

  const logout = useCallback(async () => {
    try {
      await axios.post(`${SERVER_URL}/logout`, null, { withCredentials: true });
    } catch (requestError) {
      // Sign-out is best effort; the local session ends either way.
    }
    navigate("/");
  }, [navigate]);

  return { user, loading, error, logout };
};

export default useRoleSession;
