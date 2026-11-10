import type { Metadata } from "next";

// Stránka registrace je klientská, popis pro vyhledávače a náhled odkazu proto nese layout.
export const metadata: Metadata = {
  title: "Registrace. Prales",
  description: "Založ si klub ve svém okrese a veď ho v okresní lize proti kamarádům. Zdarma, v prohlížeči na mobilu i na počítači.",
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
