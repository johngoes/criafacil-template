import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CriaFácil",
  description: "Aplicativo criado com CriaFácil",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-white text-zinc-900 font-sans">
        {children}
      </body>
    </html>
  );
}
