export function CheckTag({ label, active }: { label: string; active?: boolean }) {
    return (
        <span className="check-tag" data-active={active ?? false}>
            {label}
        </span>
    );
}
