import assert from "node:assert/strict";
import { test } from "node:test";
import {
  accessSnapshot,
  manageAccess,
  isAccessAdmin,
  assertSameOrigin,
  userSummary,
  parseEmails,
} from "../lib/users-access.mjs";

const config = {
  adminEmails: "owner@example.com",
  approvedEmails: "owner@example.com,legacy@example.com",
};
const makeUser = (id, email, extra = {}) => ({
  id: `user_${id}`,
  primaryEmailAddressId: `id_${id}`,
  emailAddresses: [
    {
      id: `id_${id}`,
      emailAddress: email,
      verification: { status: "verified" },
    },
  ],
  publicMetadata: {},
  privateMetadata: {},
  ...extra,
});
const owner = makeUser("owner", "owner@example.com");
function fixture() {
  const accounts = [
    owner,
    makeUser("pending", "new@example.com"),
    makeUser("legacy", "legacy@example.com"),
    makeUser("admin", "admin@example.com", {
      privateMetadata: { formularyAdmin: true },
    }),
  ].map((user) => structuredClone(user));
  const writes = [];
  const invitations = [];
  const client = {
    users: {
      getUserList: async ({ emailAddress, limit = 100, offset = 0 } = {}) => {
        const matches = emailAddress
          ? accounts.filter((user) =>
              user.emailAddresses.some((email) =>
                emailAddress.includes(email.emailAddress),
              ),
            )
          : accounts;
        return {
          data: matches.slice(offset, offset + limit),
          totalCount: matches.length,
        };
      },
      getUser: async (id) => {
        const user = accounts.find((entry) => entry.id === id);
        if (!user) throw new Error("not found");
        return structuredClone(user);
      },
      updateUserMetadata: async (id, patch) => {
        writes.push({ id, patch });
        const user = accounts.find((entry) => entry.id === id);
        for (const key of ["publicMetadata", "privateMetadata"])
          user[key] = { ...user[key], ...patch[key] };
        return user;
      },
    },
    invitations: {
      getInvitationList: async () => ({
        data: invitations,
        totalCount: invitations.length,
      }),
      createInvitation: async (params) => {
        invitations.push({ ...params, id: "inv_new", createdAt: Date.now() });
      },
      revokeInvitation: async (id) => {
        invitations.splice(
          invitations.findIndex((entry) => entry.id === id),
          1,
        );
      },
    },
  };
  return { client, accounts, writes, invitations };
}

test("only a verified primary bootstrap address or private admin flag grants administrator access", () => {
  assert.equal(isAccessAdmin(owner, config.adminEmails), true);
  for (const user of [
    null,
    makeUser("a", "other@example.com", {
      publicMetadata: { formularyAccess: true, formularyAdmin: true },
      unsafeMetadata: { formularyAdmin: true },
    }),
    { ...owner, banned: true },
    { ...owner, locked: true },
    { ...owner, primaryEmailAddressId: "wrong" },
  ])
    assert.equal(isAccessAdmin(user, config.adminEmails), false);
  const unverified = structuredClone(owner);
  unverified.emailAddresses[0].verification.status = "unverified";
  assert.equal(isAccessAdmin(unverified, config.adminEmails), false);
  assert.equal(
    isAccessAdmin(
      makeUser("a", "other@example.com", {
        privateMetadata: { formularyAdmin: true },
      }),
    ),
    true,
  );
});

test("every listing and mutation independently rejects anonymous and non-admin users", async () => {
  const { client, writes, invitations } = fixture();
  for (const [actor, status] of [
    [null, 401],
    [
      makeUser("ordinary", "regular@example.com", {
        publicMetadata: { formularyAccess: true },
      }),
      403,
    ],
  ]) {
    await assert.rejects(accessSnapshot(client, actor, config), { status });
    for (const action of ["approve", "revoke", "invite", "cancel-invitation"])
      await assert.rejects(
        manageAccess(
          client,
          actor,
          config,
          { action, ids: ["user_pending"], emails: "newperson@example.com" },
          "https://app.example.com",
        ),
        { status },
      );
  }
  assert.equal(writes.length + invitations.length, 0);
});

test("mutations require same-origin JSON; cross-site forms and missing origins fail", () => {
  const makeRequest = (
    origin,
    contentType = "application/json",
    site = "same-origin",
  ) =>
    new Request("https://app.example.com/tools/users-access/api", {
      method: "POST",
      headers: {
        ...(origin ? { origin } : {}),
        "content-type": contentType,
        "sec-fetch-site": site,
      },
    });
  assert.doesNotThrow(() =>
    assertSameOrigin(makeRequest("https://app.example.com")),
  );
  for (const request of [
    makeRequest(null),
    makeRequest("https://evil.example.com"),
    makeRequest("https://app.example.com", "application/json", "cross-site"),
  ])
    assert.throws(() => assertSameOrigin(request), { status: 403 });
  assert.throws(
    () =>
      assertSameOrigin(makeRequest("https://app.example.com", "text/plain")),
    { status: 415 },
  );
});

test("approval and revocation preserve unrelated metadata, override legacy access and record trusted actor", async () => {
  const { client, accounts, writes } = fixture();
  accounts[1].privateMetadata = {
    unrelated: "private",
    formularyAccessHistory: Array.from({ length: 8 }, () => ({
      action: "approve",
      at: "2026-01-01",
      by: "old@example.com",
    })),
  };
  accounts[1].publicMetadata = { unrelated: "public" };
  const result = await manageAccess(
    client,
    owner,
    config,
    {
      action: "approve",
      ids: ["user_pending", "user_missing"],
      actor: "evil@example.com",
      privateMetadata: { formularyAdmin: true },
    },
    "https://app.example.com",
  );
  assert.equal(result.results[0].ok, true);
  assert.equal(result.results[1].ok, false);
  assert.equal(accounts[1].publicMetadata.formularyAccess, true);
  assert.equal(accounts[1].publicMetadata.unrelated, "public");
  assert.equal(accounts[1].privateMetadata.unrelated, "private");
  assert.equal(accounts[1].privateMetadata.formularyAdmin, undefined);
  assert.equal(accounts[1].privateMetadata.formularyAccessHistory.length, 8);
  assert.equal(
    accounts[1].privateMetadata.formularyAccessHistory.at(-1).by,
    owner.emailAddresses[0].emailAddress,
  );
  await manageAccess(
    client,
    owner,
    config,
    { action: "revoke", ids: ["user_legacy"] },
    "https://app.example.com",
  );
  assert.equal(userSummary(accounts[2], config).status, "revoked");
  assert.equal(writes.length, 2);
});

test("bootstrap and delegated administrators cannot be revoked and approvals never grant admin rights", async () => {
  const { client, writes } = fixture();
  const result = await manageAccess(
    client,
    owner,
    config,
    { action: "revoke", ids: ["user_owner", "user_admin"] },
    "https://app.example.com",
  );
  assert.ok(result.results.every((entry) => !entry.ok));
  assert.equal(writes.length, 0);
  await manageAccess(
    client,
    owner,
    config,
    { action: "approve", ids: ["user_pending"] },
    "https://app.example.com",
  );
  assert.deepEqual(Object.keys(writes[0].patch.privateMetadata), [
    "formularyAccessHistory",
  ]);
});

test("bulk and input limits reject invalid requests before any side effects", async () => {
  const { client, writes } = fixture();
  for (const ids of [
    [],
    Array.from({ length: 21 }, (_, id) => `user_${id}`),
    ["../secret"],
    "user_pending",
  ])
    await assert.rejects(
      manageAccess(
        client,
        owner,
        config,
        { action: "approve", ids },
        "https://app.example.com",
      ),
    );
  assert.throws(() => parseEmails("bad-email"));
  assert.throws(() =>
    parseEmails(
      Array.from({ length: 21 }, (_, id) => `${id}@example.com`).join(","),
    ),
  );
  assert.deepEqual(
    parseEmails("TEAM@example.com; team@example.com\nother@example.com"),
    ["team@example.com", "other@example.com"],
  );
  assert.equal(writes.length, 0);
});

test("invitations preapprove only exact addresses, existing users are approved without emails, and no invite secrets leak", async () => {
  const { client, accounts, invitations } = fixture();
  await manageAccess(
    client,
    owner,
    config,
    { action: "invite", emails: "NEW@example.com, colleague@example.com" },
    "https://app.example.com",
  );
  assert.equal(accounts[1].publicMetadata.formularyAccess, true);
  assert.equal(invitations.length, 1);
  assert.equal(invitations[0].emailAddress, "colleague@example.com");
  assert.equal(invitations[0].publicMetadata.formularyAccess, true);
  assert.equal(invitations[0].publicMetadata.formularyAdmin, undefined);
  assert.equal(
    invitations[0].redirectUrl,
    "https://app.example.com/tools/sign-up",
  );
  assert.equal(invitations[0].expiresInDays, 7);
  assert.equal(invitations[0].ignoreExisting, false);
  invitations[0].url = "SECRET_INVITE_URL";
  const snapshot = await accessSnapshot(client, owner, config);
  assert.ok(!JSON.stringify(snapshot).includes("SECRET_INVITE_URL"));
  assert.ok(!JSON.stringify(snapshot).includes("privateMetadata"));
  await manageAccess(
    client,
    owner,
    config,
    { action: "cancel-invitation", ids: ["inv_new"] },
    "https://app.example.com",
  );
  assert.equal(invitations.length, 0);
});

test("existing unverified emails and blocked accounts cannot be approved via invitations", async () => {
  const { client, accounts, writes } = fixture();
  accounts[1].emailAddresses[0].verification.status = "unverified";
  const result = await manageAccess(
    client,
    owner,
    config,
    { action: "invite", emails: "new@example.com" },
    "https://app.example.com",
  );
  assert.equal(result.results[0].ok, false);
  accounts[1].banned = true;
  const blocked = await manageAccess(
    client,
    owner,
    config,
    { action: "approve", ids: [accounts[1].id] },
    "https://app.example.com",
  );
  assert.equal(blocked.results[0].ok, false);
  assert.equal(writes.length, 0);
});

test("snapshot paginates and explicitly reports a capped result set", async () => {
  const { client } = fixture();
  let calls = 0;
  client.users.getUserList = async ({ limit, offset }) => {
    calls++;
    return {
      totalCount: 1001,
      data: Array.from({ length: Math.min(limit, 1001 - offset) }, (_, index) =>
        makeUser(`${offset + index}`, `${offset + index}@example.com`),
      ),
    };
  };
  const snapshot = await accessSnapshot(client, owner, config);
  assert.equal(calls, 10);
  assert.equal(snapshot.users.length, 1000);
  assert.equal(snapshot.totalUsers, 1001);
  assert.equal(snapshot.truncated, true);
});
