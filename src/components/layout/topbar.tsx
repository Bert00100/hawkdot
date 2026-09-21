"use client";

import { Icon } from "@/components/ui/icon";
import type { Me } from "@/lib/api/types";

export function Topbar({
    me,
    onOpenMenu,
    query,
    onQueryChange,
    searchPlaceholder = "Buscar...",
}: {
    me: Me | null;
    onOpenMenu: () => void;
    query?: string;
    onQueryChange?: (value: string) => void;
    searchPlaceholder?: string;
}) {
    return (
        <header className="topbar">
            <button className="hamburger" onClick={onOpenMenu} aria-label="Abrir menu">
                ☰
            </button>
            <div className="org">
                <span>{(me?.organization.name ?? "H")[0]}</span>
                <div>
                    <small>ORGANIZAÇÃO</small>
                    <b>{me?.organization.name ?? "Carregando..."}</b>
                </div>
            </div>
            <div className="top-actions">
                {onQueryChange && (
                    <label className="search">
                        <Icon name="search" />
                        <input
                            value={query ?? ""}
                            onChange={(event) => onQueryChange(event.target.value)}
                            placeholder={searchPlaceholder}
                        />
                    </label>
                )}
                <button className="bell" disabled aria-label="Notificações em breve" title="Em breve">
                    <Icon name="bell" />
                </button>
            </div>
        </header>
    );
}
