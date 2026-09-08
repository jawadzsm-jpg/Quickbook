import EnterpriseApp from "./enterprise-app";
import { LoginScreen } from "./login-screen";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getSessionUser();
  if (!user) return <LoginScreen />;
  return <EnterpriseApp currentUser={user} />;
}
