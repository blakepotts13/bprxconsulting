import { ClerkProvider } from "@clerk/nextjs";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default function ToolsLayout({ children }) {
  return (
    <ClerkProvider
      signInUrl="/tools/sign-in"
      signUpUrl="/tools/sign-up"
      signUpFallbackRedirectUrl="/tools/account"
      signInFallbackRedirectUrl="/tools/formulary-reference"
      afterSignOutUrl="/"
    >
      {children}
    </ClerkProvider>
  );
}
