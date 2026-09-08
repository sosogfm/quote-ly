import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { isOwnerEmail } from "@/lib/owner";

/** Route guard: only the owner accounts may reach the Central de Evolução. */
export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (!isOwnerEmail(user.email)) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
