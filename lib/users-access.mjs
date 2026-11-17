import { isApprovedFormularyUser } from "./formulary-policy.mjs";

export const MAX_BATCH = 20;
export const HISTORY_LIMIT = 8;
const SNAPSHOT_LIMIT = 1000;

export class AccessError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export function verifiedEmail(user) {
  return (
    user?.emailAddresses
      ?.find(
        (email) =>
          email.id === user.primaryEmailAddressId &&
          email.verification?.status === "verified",
      )
      ?.emailAddress?.toLowerCase() || ""
  );
}

export function isAccessOwner(user, adminEmails = "") {
  const email = verifiedEmail(user);
  if (!email || user.banned || user.locked) return false;
  const owners = adminEmails
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return owners.includes(email);
}

export function isAccessAdmin(user, adminEmails = "") {
  if (!verifiedEmail(user) || user.banned || user.locked) return false;
  return (
    isAccessOwner(user, adminEmails) ||
    user.privateMetadata?.formularyAdmin === true
  );
}

export function requireAdmin(user, config) {
  if (!user) throw new AccessError("Sign in to manage access.", 401);
  if (!isAccessAdmin(user, config.adminEmails))
    throw new AccessError("Administrator access is required.", 403);
  return { id: user.id, email: verifiedEmail(user) };
}

function history(user) {
  const entries = user.privateMetadata?.formularyAccessHistory;
  return Array.isArray(entries)
    ? entries
        .filter(
          (event) =>
            event &&
            ["approve", "revoke", "make-admin", "remove-admin"].includes(
              event.action,
            ) &&
            typeof event.at === "string" &&
            typeof event.by === "string",
        )
        .slice(-HISTORY_LIMIT)
    : [];
}

export function userSummary(user, config) {
  const primary = user.emailAddresses?.find(
    (email) => email.id === user.primaryEmailAddressId,
  );
  return {
    id: user.id,
    name: [user.firstName, user.lastName].filter(Boolean).join(" ") || "—",
    email: primary?.emailAddress || "No email address",
    verified: primary?.verification?.status === "verified",
    status:
      user.banned || user.locked
        ? "blocked"
        : user.publicMetadata?.formularyAccess === false
          ? "revoked"
          : isApprovedFormularyUser(user, config.approvedEmails)
            ? "approved"
            : "pending",
    admin: isAccessAdmin(user, config.adminEmails),
    owner: isAccessOwner(user, config.adminEmails),
    assignedAdmin: user.privateMetadata?.formularyAdmin === true,
    createdAt: user.createdAt,
    lastSignInAt: user.lastSignInAt,
    history: history(user),
    invitedAt:
      typeof user.publicMetadata?.formularyInvitedAt === "string"
        ? user.publicMetadata.formularyInvitedAt
        : null,
  };
}

async function collect(fetchPage) {
  const data = [];
  let total = 0;
  do {
    const page = await fetchPage({ limit: 100, offset: data.length });
    total = page.totalCount;
    data.push(...page.data);
    if (!page.data.length) break;
  } while (data.length < total && data.length < SNAPSHOT_LIMIT);
  return { data, total, truncated: data.length < total };
}

export async function accessSnapshot(client, user, config, query = "") {
  requireAdmin(user, config);
  if (query.length > 120)
    throw new AccessError("Search must be 120 characters or fewer.");
  const [users, invitations] = await Promise.all([
    collect((page) =>
      client.users.getUserList({
        ...page,
        orderBy: "-created_at",
        ...(query ? { query } : {}),
      }),
    ),
    collect((page) =>
      client.invitations.getInvitationList({
        ...page,
        status: "pending",
        ...(query ? { query } : {}),
      }),
    ),
  ]);
  return {
    users: users.data.map((entry) => userSummary(entry, config)),
    invitations: invitations.data.map((entry) => ({
      id: entry.id,
      email: entry.emailAddress,
      createdAt: entry.createdAt,
      preapproved: entry.publicMetadata?.formularyAccess === true,
    })),
    totalUsers: users.total,
    totalInvitations: invitations.total,
    truncated: users.truncated || invitations.truncated,
    actorEmail: verifiedEmail(user),
    actorIsOwner: isAccessOwner(user, config.adminEmails),
  };
}

function ids(values, prefix) {
  if (
    !Array.isArray(values) ||
    !values.length ||
    values.length > MAX_BATCH ||
    values.some(
      (value) =>
        typeof value !== "string" ||
        !new RegExp(`^${prefix}_[a-zA-Z0-9]+$`).test(value),
    )
  ) {
    throw new AccessError(`Choose between 1 and ${MAX_BATCH} valid accounts.`);
  }
  return [...new Set(values)];
}

export function parseEmails(value) {
  if (typeof value !== "string" || value.length > 6000)
    throw new AccessError(
      "Enter email addresses separated by commas or new lines.",
    );
  const emails = [
    ...new Set(
      value
        .split(/[\s,;]+/)
        .filter(Boolean)
        .map((email) => email.toLowerCase()),
    ),
  ];
  if (
    !emails.length ||
    emails.length > MAX_BATCH ||
    emails.some(
      (email) =>
        email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
    )
  ) {
    throw new AccessError(`Enter 1–${MAX_BATCH} valid email addresses.`);
  }
  return emails;
}

async function saveMetadata(client, target, patch) {
  const combined = {
    publicMetadata: { ...target.publicMetadata, ...patch.publicMetadata },
    privateMetadata: { ...target.privateMetadata, ...patch.privateMetadata },
    unsafeMetadata: target.unsafeMetadata,
  };
  if (Buffer.byteLength(JSON.stringify(combined)) > 7500)
    throw new AccessError(
      "Account metadata is full. Review this account in Clerk before making changes.",
    );
  await client.users.updateUserMetadata(target.id, patch);
}

async function changeRole(client, target, action, actor, config) {
  if (isAccessOwner(target, config.adminEmails))
    throw new AccessError(
      "Owner accounts are protected. Their role cannot be changed here.",
    );
  if (target.id === actor.id)
    throw new AccessError("You cannot change your own administrator role.");
  const makeAdmin = action === "make-admin";
  if (
    makeAdmin &&
    (!verifiedEmail(target) ||
      target.banned ||
      target.locked ||
      !isApprovedFormularyUser(target, config.approvedEmails))
  )
    throw new AccessError(
      "Approve reference access and verify the primary email before making this user an administrator. Blocked accounts cannot become administrators.",
    );
  if ((target.privateMetadata?.formularyAdmin === true) === makeAdmin)
    return makeAdmin ? "Already an administrator" : "Already a regular user";
  const event = { action, at: new Date().toISOString(), by: actor.email };
  await saveMetadata(client, target, {
    privateMetadata: {
      formularyAdmin: makeAdmin,
      formularyAccessHistory: [...history(target), event].slice(-HISTORY_LIMIT),
    },
  });
  return makeAdmin
    ? "Made administrator"
    : "Administrator role removed; reference access unchanged";
}

async function changeAccess(client, target, action, actor, config) {
  if (
    action === "revoke" &&
    (isAccessAdmin(target, config.adminEmails) ||
      target.privateMetadata?.formularyAdmin === true)
  )
    throw new AccessError(
      "Administrator accounts are protected from revocation here.",
    );
  if (target.banned || target.locked)
    throw new AccessError(
      "This account is blocked in Clerk. Resolve that in Clerk first.",
    );
  const approved = action === "approve";
  if (
    isApprovedFormularyUser(target, config.approvedEmails) === approved &&
    (approved || target.publicMetadata?.formularyAccess === false)
  )
    return "Already " + (approved ? "approved" : "revoked");
  const event = { action, at: new Date().toISOString(), by: actor.email };
  const entries = [...history(target), event].slice(-HISTORY_LIMIT);
  await saveMetadata(client, target, {
    publicMetadata: { formularyAccess: approved },
    privateMetadata: { formularyAccessHistory: entries },
  });
  return approved ? "Approved" : "Revoked";
}

export async function manageAccess(client, user, config, input, origin) {
  const actor = requireAdmin(user, config);
  if (!input || typeof input !== "object")
    throw new AccessError("Invalid request.");
  const roleChange = ["make-admin", "remove-admin"].includes(input.action);
  if (roleChange && !isAccessOwner(user, config.adminEmails))
    throw new AccessError(
      "Only the owner can change administrator roles.",
      403,
    );
  let targets;
  if (["approve", "revoke"].includes(input.action) || roleChange)
    targets = ids(input.ids, "user");
  else if (input.action === "cancel-invitation")
    targets = ids(input.ids, "inv");
  else if (input.action === "invite") targets = parseEmails(input.emails);
  else throw new AccessError("Unknown action.");
  if (roleChange && targets.length !== 1)
    throw new AccessError("Change one administrator role at a time.");
  const results = [];
  // Keep each account independent so one failure cannot hide successful changes.
  for (const target of targets) {
    try {
      let message;
      if (input.action === "invite") {
        const matches = await client.users.getUserList({
          emailAddress: [target],
          limit: 2,
        });
        const existing = matches.data.find((entry) =>
          entry.emailAddresses.some(
            (email) => email.emailAddress.toLowerCase() === target,
          ),
        );
        if (existing) {
          if (
            !existing.emailAddresses.some(
              (email) =>
                email.emailAddress.toLowerCase() === target &&
                email.verification?.status === "verified",
            )
          )
            throw new AccessError(
              "Existing account must verify this email before approval.",
            );
          message = await changeAccess(
            client,
            existing,
            "approve",
            actor,
            config,
          );
        } else {
          await client.invitations.createInvitation({
            emailAddress: target,
            publicMetadata: {
              formularyAccess: true,
              formularyInvitedAt: new Date().toISOString(),
            },
            redirectUrl: `${origin}/tools/sign-up`,
            expiresInDays: 7,
            notify: true,
            ignoreExisting: false,
          });
          message = "Invitation sent (preapproved, valid 7 days)";
        }
      } else if (input.action === "cancel-invitation") {
        await client.invitations.revokeInvitation(target);
        message = "Invitation canceled";
      } else {
        const account = await client.users.getUser(target);
        message = await (roleChange ? changeRole : changeAccess)(
          client,
          account,
          input.action,
          actor,
          config,
        );
      }
      results.push({ target, ok: true, message });
    } catch (error) {
      results.push({
        target,
        ok: false,
        message:
          error instanceof AccessError
            ? error.message
            : "Clerk could not complete this change. Refresh to check the current state; an invitation may already exist.",
      });
    }
  }
  return { results };
}

export function assertSameOrigin(request) {
  if (
    request.headers.get("origin") !== new URL(request.url).origin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new AccessError("Reload this page before submitting changes.", 403);
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new AccessError("JSON is required.", 415);
}
