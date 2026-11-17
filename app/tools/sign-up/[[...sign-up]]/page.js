import { Suspense } from "react";
import { SignUp } from "@clerk/nextjs";

export const metadata = { title: "Create a reference account" };

export default function SignUpPage() {
  return (
    <main className="section shell narrow">
      <p className="eyebrow">BPRx FORMULARY REFERENCE</p>
      <h1>Create your account.</h1>
      <p>
        After verifying your email, access to Formulary Reference requires
        approval from BPRx Consulting.
      </p>
      <Suspense fallback={<p>Loading account registration…</p>}>
        <SignUp
          routing="path"
          path="/tools/sign-up"
          fallbackRedirectUrl="/tools/account"
        />
      </Suspense>
    </main>
  );
}
