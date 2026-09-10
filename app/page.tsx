import EnterpriseApp from "./enterprise-app";
import { LoginScreen } from "./login-screen";
import { PasswordChangeScreen } from "./password-change-screen";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getSessionUser();
  if (!user) return <LoginScreen />;
  if (user.mustChangePassword) return <PasswordChangeScreen email={user.email} />;
  return <EnterpriseApp currentUser={user} />;
}
