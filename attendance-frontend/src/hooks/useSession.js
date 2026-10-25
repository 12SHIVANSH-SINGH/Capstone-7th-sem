import { useEffect, useState } from "react";
import SERVER_URL from "../config/api";

/**
 * Read the current cookie session for public pages.
 *
 * Protected pages already do their own /islogin check. This hook exists for
 * the landing and login pages, which otherwise cannot tell a signed-in visitor
 * from a signed-out one and keep showing "Sign in" after a successful login.
 *
 * Any failure (401, network error) is treated as "signed out": public pages
 * must still render when the API is unavailable.
 */
const useSession = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch(`${SERVER_URL}/islogin`, {
          credentials: "include",
          signal: controller.signal,
        });
        if (!response.ok) {
          if (!cancelled) setLoading(false);
          return;
        }
        const data = await response.json();
        if (!cancelled) {
          setUser(data?.user || null);
          setLoading(false);
        }
      } catch (error) {
        if (error.name !== "AbortError" && !cancelled) {
          setUser(null);
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  return { user, loading };
};

export default useSession;
