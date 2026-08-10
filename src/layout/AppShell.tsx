import type { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { signOut } from "@/firebase";

const nav: { to: string; label: string; end?: boolean }[] = [
  { to: "/manifest", label: "Manifest" },
  { to: "/portfolio", label: "Portfolio" },
  { to: "/sets", label: "Sets" },
  { to: "/inventory/graded", label: "Graded" },
  { to: "/where", label: "Storage" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const email = auth.status === "signed-in" ? auth.user.email : "";

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-6">
          <Link to="/" className="font-bold text-lg tracking-tight">FG-Collect Admin</Link>
          <nav className="flex items-center gap-1 text-sm">
            {nav.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded ${
                    isActive ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-100"
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-xs text-gray-500">
            <span>{email}</span>
            <button
              type="button"
              onClick={() => void signOut()}
              className="px-2.5 py-1 border border-gray-300 rounded hover:bg-gray-100"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
