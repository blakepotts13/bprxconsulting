/** Only a server-managed approval or a verified allowlisted address grants access. */
export function isApprovedFormularyUser(user, approvedEmails = "") {
  if (!user) return false;
  const approval = user.publicMetadata?.formularyAccess;
  if (approval === false) return false;
  if (approval === true) return true;
  const allowed = new Set(
    approvedEmails
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
  return (
    user.emailAddresses?.some(
      (email) =>
        email.verification?.status === "verified" &&
        allowed.has(email.emailAddress.toLowerCase()),
    ) ?? false
  );
}
