import { useAuth } from "@workspace/replit-auth-web";

export function useCurrentUser() {
  const { user, isLoading, isAuthenticated, login, logout } = useAuth();
  return {
    user,
    isLoading,
    isAuthenticated,
    userId: user?.appUserId ?? null,
    isAdmin: user?.isAdmin ?? false,
    login,
    logout,
  };
}
