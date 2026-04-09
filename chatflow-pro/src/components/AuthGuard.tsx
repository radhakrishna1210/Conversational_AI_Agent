import { Navigate, useLocation } from "react-router-dom";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem("token");
  const workspaceId = localStorage.getItem("workspaceId");
  const location = useLocation();

  if (!token || !workspaceId) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
