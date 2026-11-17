import { Suspense } from "react";
import { SignIn } from "@clerk/nextjs";

export const metadata = { title: "Sign in to Formulary Reference" };

export default function SignInPage() {
  return (
    <main className="section shell narrow">
      <p className="eyebrow">BPRx FORMULARY REFERENCE</p>
      <h1>Sign in to your reference workspace.</h1>
      <p>
        Access is available to approved users. Signing in does not automatically
        grant access.
      </p>
      <Suspense fallback={<p>Loading sign-in…</p>}>
        <SignIn
          routing="path"
          path="/tools/sign-in"
          fallbackRedirectUrl="/tools/formulary-reference"
        />
      </Suspense>
    </main>
  );
}
