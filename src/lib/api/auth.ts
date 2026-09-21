import { apiClient } from "@/lib/api/client";
import type { Me } from "@/lib/api/types";

export type SignupInput = {
    email: string;
    password: string;
    display_name: string;
    organization_name: string;
    organization_slug: string;
};

export type LoginInput = { email: string; password: string };

export const authApi = {
    signup: (data: SignupInput) => apiClient.post<{ user: { id: string; email: string; display_name: string } }>("/api/auth/signup", data),
    login: (data: LoginInput) =>
        apiClient.post<{ user: { id: string; email: string; display_name: string }; organization_id: string }>(
            "/api/auth/login",
            data,
        ),
    logout: () => apiClient.post<{ ok: true }>("/api/auth/logout"),
    me: () => apiClient.get<Me>("/api/me"),
};
