import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import AccessRequests from "./requests";
export default async function AccessRequestsPage() {
  const session = await getServerSession(authOptions);
  if (session?.user.admission === "onboarding") redirect("/access-request");
  if (session?.user.role !== "ADMIN") redirect("/dashboard");
  return <AccessRequests />;
}
