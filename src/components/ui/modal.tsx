"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Icon } from "@/components/ui/icon";

export function Modal({
    title,
    subtitle,
    onClose,
    children,
}: {
    title: string;
    subtitle?: string;
    onClose: () => void;
    children: ReactNode;
}) {
    const dialog = useRef<HTMLDivElement>(null);
    const close = useRef(onClose);
    const titleId = useId();
    useEffect(() => { close.current = onClose; }, [onClose]);
    useEffect(() => {
        const previous = document.activeElement as HTMLElement | null;
        const overflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const focusable = () => Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]') ?? []);
        focusable()[0]?.focus();
        const handler = (event: KeyboardEvent) => {
            if (event.key === "Escape") close.current();
            if (event.key === "Tab") {
                const elements = focusable();
                const first = elements[0];
                const last = elements.at(-1);
                if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
                else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
            }
        };
        document.addEventListener("keydown", handler);
        return () => { document.removeEventListener("keydown", handler); document.body.style.overflow = overflow; previous?.focus(); };
    }, []);

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div ref={dialog} className="modal-card" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(e) => e.stopPropagation()}>
                <div className="modal-head">
                    <div>
                        <h2 id={titleId}>{title}</h2>
                        {subtitle && <p>{subtitle}</p>}
                    </div>
                    <button className="icon-btn" onClick={onClose} aria-label="Fechar">
                        <Icon name="close" size={16} />
                    </button>
                </div>
                <div className="modal-body">{children}</div>
            </div>
        </div>
    );
}
