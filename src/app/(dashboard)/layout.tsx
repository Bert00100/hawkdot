"use client";

import { useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { useSession } from "@/hooks/use-session";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const { me, loading, error, reload, logout } = useSession();
    const [menuOpen, setMenuOpen] = useState(false);

    if (loading) {
        return (
            <div className="app-shell">
                <div className="boot-loading">Carregando...</div>
            </div>
        );
    }

    if (!me) return <div className="boot-loading" role="alert">{error ?? "Redirecionando..."}
        {error && <button className="secondary" onClick={() => void reload()}>Tentar novamente</button>}</div>;

    return (
        <div className="app-shell">
            <Sidebar me={me} open={menuOpen} onClose={() => setMenuOpen(false)} onLogout={logout} />
            {menuOpen && <button className="sidebar-backdrop" aria-label="Fechar menu" onClick={() => setMenuOpen(false)} />}
            <main className="workspace">
                <Topbar me={me} onOpenMenu={() => setMenuOpen(true)} />
                <div className="content">{error && <div role="alert" className="form-error">{error}</div>}{children}</div>
            </main>
        </div>
    );
}
