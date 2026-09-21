"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/icon";
import type { Me } from "@/lib/api/types";

const nav: { label: string; icon: IconName; href: string }[] = [
    { label: "Visão geral", icon: "grid", href: "/" },
    { label: "Monitores", icon: "pulse", href: "/monitors" },
    { label: "Recursos", icon: "server", href: "/resources" },
];

const soon: { label: string; icon: IconName }[] = [
    { label: "Notificações", icon: "bell" },
    { label: "Equipe", icon: "team" },
];

export function Sidebar({
    me,
    open,
    onClose,
    onLogout,
}: {
    me: Me | null;
    open: boolean;
    onClose: () => void;
    onLogout: () => void;
}) {
    const pathname = usePathname();

    return (
        <aside className={`sidebar ${open ? "open" : ""}`}>
            <div className="brand">
                <span className="brand-mark">
                    <i />
                </span>
                <span>
                    hawk<b>dot</b>
                </span>
                <button onClick={onClose} aria-label="Fechar menu">
                    ×
                </button>
            </div>
            <nav>
                {nav.map(({ label, icon, href }) => {
                    const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
                    return (
                        <Link key={label} href={href} onClick={onClose} className={`nav-item ${active ? "active" : ""}`}>
                            <Icon name={icon} />
                            <span>{label}</span>
                        </Link>
                    );
                })}
                {soon.map(({ label, icon }) => (
                    <button key={label} className="nav-item" disabled title="Em breve" style={{ opacity: 0.45, cursor: "default" }}>
                        <Icon name={icon} />
                        <span>{label}</span>
                    </button>
                ))}
            </nav>
            <div className="sidebar-foot">
                <button className="nav-item" onClick={onLogout}>
                    <Icon name="logout" />
                    <span>Sair</span>
                </button>
                <div className="profile">
                    <span>{(me?.user.display_name ?? "?").split(" ").map((v) => v[0]).slice(0, 2).join("")}</span>
                    <div>
                        <b>{me?.user.display_name ?? "Carregando..."}</b>
                        <small>{me?.organization.role ?? ""}</small>
                    </div>
                    <Icon name="more" />
                </div>
            </div>
        </aside>
    );
}
