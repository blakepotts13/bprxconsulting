import Link from "next/link";
import { redirect } from "next/navigation";
import { adminContext } from "../../../lib/users-access-auth";
import { AccessError } from "../../../lib/users-access.mjs";
import UsersAccess from "./users-access";
import "./users-access.css";

export const metadata = { title: "Users & Access" };
export default async function UsersAccessPage() {
  try {
    await adminContext();
  } catch (error) {
    if (error instanceof AccessError && error.status === 401)
      redirect("/tools/sign-in?redirect_url=%2Ftools%2Fusers-access");
    return (
      <main className="section shell narrow">
        <p className="eyebrow">PRIVATE ADMINISTRATION</p>
        <h1>
          {error.status === 403
            ? "Administrator access required"
            : "Account services unavailable"}
        </h1>
        <p>{error.message}</p>
        <Link className="text-link" href="/tools/account">
          Back to your account
        </Link>
      </main>
    );
  }
  return <UsersAccess />;
}
