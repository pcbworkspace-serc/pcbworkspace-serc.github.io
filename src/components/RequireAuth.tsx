import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { authReadyPromise, isAuthenticated } from "@/lib/auth";

export default function RequireAuth() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void authReadyPromise.then(() => setReady(true));
  }, []);

  if (!ready) {
    return null;
  }

  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
