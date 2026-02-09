import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function AdminRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white">Loading...</div>;
  }

  if (!user || user.role !== "admin") {
    // Redirect non-admins to dashboard
    return <Navigate to="/" replace />;
  }

  return children;
}
