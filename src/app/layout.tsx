import type { Metadata } from "next";
import { Chakra_Petch, IBM_Plex_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Fontes do design system: Chakra Petch (display/heading), IBM Plex Sans
// (texto), JetBrains Mono (dados/metricas -- uptime%, latencia).
const chakraPetch = Chakra_Petch({
    subsets: ["latin"],
    weight: ["500", "600", "700"],
    variable: "--font-display",
});
const ibmPlexSans = IBM_Plex_Sans({
    subsets: ["latin"],
    weight: ["400", "500", "600"],
    variable: "--font-body",
});
const jetbrainsMono = JetBrains_Mono({
    subsets: ["latin"],
    weight: ["400", "500", "600"],
    variable: "--font-data",
});

export const metadata: Metadata = {
    title: "Hawk Dot — Monitoramento de infraestrutura",
    description: "Ping, HTTP/HTTPS, SSL — cada serviço sob o olho do falcão.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
    return (
        <html
            lang="pt-BR"
            className={`h-full antialiased ${chakraPetch.variable} ${ibmPlexSans.variable} ${jetbrainsMono.variable}`}
        >
            <body className="min-h-full flex flex-col">{children}</body>
        </html>
    );
}
