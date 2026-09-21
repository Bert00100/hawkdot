import type { ErrorDetail } from "@/lib/errors";

export function fieldError(details: ErrorDetail[] | undefined, field: string): string | undefined {
    return details?.find((d) => d.field === field)?.message;
}

export function FormError({ message, details }: { message: string | null; details?: ErrorDetail[] }) {
    if (!message && !details?.length) return null;
    return <div className="form-error" role="alert">{message}
        {details?.length ? <ul>{details.map((detail, index) => <li key={`${detail.field}-${index}`}>{detail.field}: {detail.message}</li>)}</ul> : null}
    </div>;
}
