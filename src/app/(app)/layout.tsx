import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/AppShell.tsx";
import { DialogProvider } from "@/components/ui/DialogProvider.tsx";
import { getSessionUser } from "@/server/session.ts";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return (
    <DialogProvider>
      <AppShell email={user.email} isAdmin={user.role === "admin"}>
        {children}
      </AppShell>
    </DialogProvider>
  );
}
