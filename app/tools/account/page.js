import Link from "next/link";
import { redirect } from "next/navigation";
import { SignOutButton, UserButton } from "@clerk/nextjs";
import { getFormularyAccess } from "../../../lib/formulary-auth";

export const metadata = { title: "Reference access" };

export default async function AccountPage() {
  const access = await getFormularyAccess();
  if (access.status === "signed-out") redirect("/tools/sign-in");
  return (
    <main className="section shell narrow">
      <p className="eyebrow">BPRx FORMULARY REFERENCE</p>
      <h1>
        {access.status === "approved"
          ? "Your reference workspace"
          : access.status === "pending"
            ? "Access awaiting approval"
            : "Sign-in temporarily unavailable"}
      </h1>
      {access.status === "approved" ? (
        <p>
          {/* This route returns a standalone HTML document and needs full navigation. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a className="button" href="/tools/formulary-reference">
            Open Formulary Reference
          </a>
        </p>
      ) : (
        <p>
          {access.status === "pending"
            ? "You are signed in. Contact BPRx Consulting to request access to the reference."
            : "Please try again shortly."}{" "}
          <Link href="/contact">Contact us</Link>
        </p>
      )}
      <UserButton />
      <p>
        <SignOutButton redirectUrl="/">
          <button type="button" className="button button-small">
            Sign out
          </button>
        </SignOutButton>
      </p>
    </main>
  );
}
