"use client";

import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { useEffect, useRef, useState } from "react";

const endpoint = "/tools/users-access/api";
const labels = {
  pending: "Pending",
  approved: "Approved",
  revoked: "Revoked",
  blocked: "Blocked",
  all: "All users",
};
const date = (value) =>
  value
    ? new Date(value).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "Never";

export default function UsersAccess() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("pending");
  const [selected, setSelected] = useState([]);
  const [emails, setEmails] = useState("");
  const [results, setResults] = useState([]);
  const [page, setPage] = useState(0);
  const requestId = useRef(0);

  async function load(value) {
    const id = ++requestId.current;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `${endpoint}?q=${encodeURIComponent(value)}`,
        { cache: "no-store" },
      );
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error || "Unable to load accounts.");
      if (id === requestId.current) {
        setData(payload);
        setSelected([]);
        setPage(0);
      }
    } catch (failure) {
      if (id === requestId.current) {
        setError(failure.message);
        setData(null);
      }
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }
  useEffect(() => {
    const counter = requestId;
    load(search);
    return () => {
      counter.current++;
    };
  }, [search]);

  async function change(action, ids) {
    if (busy || loading) return;
    const names = ids?.map(
      (id) =>
        data.users.find((user) => user.id === id)?.email ||
        data.invitations.find((invite) => invite.id === id)?.email ||
        id,
    );
    const question =
      action === "invite"
        ? `Send preapproved invitations to these addresses? Existing verified accounts will be approved without an email.\n\n${emails}`
        : action === "revoke"
          ? `Remove Formulary Reference access for:\n\n${names.join("\n")}`
          : action === "cancel-invitation"
            ? `Cancel the invitation for ${names.join(", ")}?`
            : null;
    if (question && !window.confirm(question)) return;
    setBusy(true);
    setError("");
    setResults([]);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          ...(action === "invite" ? { emails } : { ids }),
        }),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error || "Unable to save changes.");
      setResults(
        payload.results.map((result) => ({
          ...result,
          target:
            data.users.find((user) => user.id === result.target)?.email ||
            result.target,
        })),
      );
      if (action === "invite" && payload.results.every((result) => result.ok))
        setEmails("");
      await load(search);
    } catch (failure) {
      setError(
        `${failure.message} Refresh before retrying to check whether any changes completed.`,
      );
    } finally {
      setBusy(false);
    }
  }
  const users = data?.users || [];
  const filtered = users.filter((user) => tab === "all" || user.status === tab);
  const shown = filtered.slice(page * 25, (page + 1) * 25);
  const selectable = shown.filter(
    (user) => !user.admin && user.status !== "blocked",
  );
  const disabled = busy || loading;
  const counts = Object.fromEntries(
    Object.keys(labels).map((key) => [
      key,
      key === "all"
        ? users.length
        : users.filter((user) => user.status === key).length,
    ]),
  );
  function switchTab(value) {
    setTab(value);
    setSelected([]);
    setPage(0);
  }

  return (
    <main className="access-workspace shell">
      <div className="access-topline">
        <Link href="/tools/account">← Your account</Link>
        <UserButton />
      </div>
      <header className="access-heading">
        <div>
          <p className="eyebrow">PRIVATE ADMINISTRATION</p>
          <h1>Users &amp; Access</h1>
          <p>Approve your team and manage who can use Formulary Reference.</p>
        </div>
        <span className="access-private">Administrator only</span>
      </header>
      <div className="access-stats" aria-label="Account overview">
        {["pending", "approved", "all"].map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => switchTab(key)}
            disabled={disabled}
          >
            <strong>{data ? counts[key] : "—"}</strong>
            <span>{key === "pending" ? "Awaiting approval" : labels[key]}</span>
          </button>
        ))}
      </div>
      <div
        role="alert"
        className={error ? "access-alert access-error" : undefined}
      >
        {error}
      </div>
      <div role="status" aria-live="polite">
        {results.length > 0 && (
          <div className="access-alert">
            <strong>Change results</strong>
            <ul>
              {results.map((result, index) => (
                <li key={index} className={result.ok ? "success" : "error"}>
                  {result.target}: {result.message}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <section
        className="access-panel"
        aria-labelledby="directory-title"
        aria-busy={loading || busy}
      >
        <div className="access-panel-head">
          <div>
            <h2 id="directory-title">User directory</h2>
            <p>
              {data
                ? `Managing access as ${data.actorEmail}`
                : "Your account directory"}
            </p>
          </div>
          <button
            type="button"
            className="access-secondary"
            disabled={disabled}
            onClick={() => load(search)}
          >
            Refresh
          </button>
        </div>
        <form
          className="access-search"
          onSubmit={(event) => {
            event.preventDefault();
            setSelected([]);
            setSearch(query.trim());
            if (query.trim() === search) load(search);
          }}
        >
          <label htmlFor="access-search">Find a user or invitation</label>
          <div>
            <input
              id="access-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name or email"
              maxLength={120}
              type="search"
            />
            <button className="button button-small" disabled={disabled}>
              Search
            </button>
            {search && (
              <button
                type="button"
                className="access-secondary"
                disabled={disabled}
                onClick={() => {
                  setQuery("");
                  setSearch("");
                }}
              >
                Clear
              </button>
            )}
          </div>
        </form>
        {search && (
          <p className="access-note">
            Showing results matching “{search}”. Counts apply to this search.
          </p>
        )}
        {data?.truncated && (
          <p className="access-alert">
            Showing the first 1,000 matching accounts or invitations. Narrow
            your search to find additional records.
          </p>
        )}
        <div className="access-tabs" aria-label="Filter users">
          {Object.entries(labels).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={tab === key}
              disabled={disabled}
              onClick={() => switchTab(key)}
            >
              {label} <span>{data ? counts[key] : "—"}</span>
            </button>
          ))}
        </div>
        <div className="access-bulk">
          <label>
            <input
              type="checkbox"
              disabled={disabled || !selectable.length}
              checked={
                selectable.length > 0 &&
                selectable
                  .slice(0, 20)
                  .every((user) => selected.includes(user.id))
              }
              onChange={(event) =>
                setSelected(
                  event.target.checked
                    ? selectable.slice(0, 20).map((user) => user.id)
                    : [],
                )
              }
            />{" "}
            Select up to 20 on this page
          </label>
          <span>{selected.length} selected</span>
          <button
            type="button"
            className="button button-small"
            disabled={disabled || !selected.length}
            onClick={() => change("approve", selected)}
          >
            Approve selected
          </button>
          <button
            type="button"
            className="access-secondary access-danger"
            disabled={disabled || !selected.length}
            onClick={() => change("revoke", selected)}
          >
            Revoke selected
          </button>
        </div>
        {loading ? (
          <p className="access-empty">Loading accounts…</p>
        ) : !data ? (
          <p className="access-empty">
            Accounts could not be loaded. Use Refresh to try again.
          </p>
        ) : !filtered.length ? (
          <div className="access-empty">
            <strong>
              {tab === "pending"
                ? "No users awaiting approval"
                : "No matching users"}
            </strong>
            <p>
              {tab === "pending"
                ? "New signups appear here. You can also invite people below so they arrive preapproved."
                : "Try another filter or search."}
            </p>
          </div>
        ) : (
          <div className="access-user-list">
            {shown.map((user) => (
              <article className="access-user" key={user.id}>
                <div className="access-user-main">
                  <input
                    aria-label={`Select ${user.email}`}
                    type="checkbox"
                    disabled={
                      disabled ||
                      user.admin ||
                      user.status === "blocked" ||
                      (!selected.includes(user.id) && selected.length >= 20)
                    }
                    checked={selected.includes(user.id)}
                    onChange={(event) =>
                      setSelected(
                        event.target.checked
                          ? [...selected, user.id]
                          : selected.filter((id) => id !== user.id),
                      )
                    }
                  />
                  <div className="access-identity">
                    <strong>{user.email}</strong>
                    <span>
                      {user.name} ·{" "}
                      {user.verified ? "Email verified" : "Email unverified"}
                      {user.admin ? " · Administrator" : ""}
                    </span>
                  </div>
                  <span className={`access-badge access-${user.status}`}>
                    {labels[user.status]}
                  </span>
                  <div className="access-row-actions">
                    {user.status !== "approved" &&
                      user.status !== "blocked" && (
                        <button
                          type="button"
                          className="button button-small"
                          disabled={disabled}
                          onClick={() => change("approve", [user.id])}
                        >
                          Approve
                        </button>
                      )}
                    {user.status !== "revoked" &&
                      !user.admin &&
                      user.status !== "blocked" && (
                        <button
                          type="button"
                          className="access-secondary access-danger"
                          disabled={disabled}
                          onClick={() => change("revoke", [user.id])}
                        >
                          Revoke
                        </button>
                      )}
                  </div>
                </div>
                <details>
                  <summary>Account details &amp; approval history</summary>
                  <dl>
                    <div>
                      <dt>Joined</dt>
                      <dd>{date(user.createdAt)}</dd>
                    </div>
                    <div>
                      <dt>Last signed in</dt>
                      <dd>{date(user.lastSignInAt)}</dd>
                    </div>
                  </dl>
                  {user.invitedAt && (
                    <p className="access-note">
                      Preapproved invitation created {date(user.invitedAt)}.
                    </p>
                  )}
                  {user.history.length ? (
                    <ol>
                      {[...user.history].reverse().map((event, index) => (
                        <li key={index}>
                          {event.action === "approve" ? "Approved" : "Revoked"}{" "}
                          by {event.by} · {date(event.at)}
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="access-note">
                      No changes recorded by this page yet. Existing approvals
                      remain in effect.
                    </p>
                  )}
                </details>
              </article>
            ))}
          </div>
        )}
        {filtered.length > 25 && (
          <nav className="access-pagination" aria-label="Directory pages">
            <button
              type="button"
              className="access-secondary"
              disabled={disabled || page === 0}
              onClick={() => {
                setPage(page - 1);
                setSelected([]);
              }}
            >
              Previous
            </button>
            <span>
              Page {page + 1} of {Math.ceil(filtered.length / 25)}
            </span>
            <button
              type="button"
              className="access-secondary"
              disabled={disabled || (page + 1) * 25 >= filtered.length}
              onClick={() => {
                setPage(page + 1);
                setSelected([]);
              }}
            >
              Next
            </button>
          </nav>
        )}
      </section>
      <section className="access-panel" aria-labelledby="invite-title">
        <div className="access-panel-head">
          <div>
            <h2 id="invite-title">Invite your team</h2>
            <p>
              New users receive an email invitation and start with approved
              reference access. Existing verified accounts are approved without
              an email.
            </p>
          </div>
        </div>
        <form
          className="access-invite"
          onSubmit={(event) => {
            event.preventDefault();
            change("invite");
          }}
        >
          <label htmlFor="invite-emails">
            Email addresses{" "}
            <span>(up to 20, separated by commas or new lines)</span>
          </label>
          <textarea
            id="invite-emails"
            value={emails}
            onChange={(event) => setEmails(event.target.value)}
            rows={3}
            maxLength={6000}
            placeholder="colleague@hospital.org"
            required
            disabled={disabled}
          />
          <div>
            <button className="button button-small" disabled={disabled}>
              Send invitations / approve existing
            </button>
            <span className="access-note">
              Invitations expire in 7 days. No administrator rights are granted.
            </span>
          </div>
        </form>
        <h3>
          Pending invitations {data ? `(${data.invitations.length})` : ""}
        </h3>
        {data?.invitations.length ? (
          <ul className="access-invitations">
            {data.invitations.map((invite) => (
              <li key={invite.id}>
                <div>
                  <strong>{invite.email}</strong>
                  <span>
                    {invite.preapproved
                      ? "Preapproved"
                      : "Approval required after signup"}{" "}
                    · Sent {date(invite.createdAt)}
                  </span>
                </div>
                <button
                  type="button"
                  className="access-secondary access-danger"
                  disabled={disabled}
                  onClick={() => change("cancel-invitation", [invite.id])}
                >
                  Cancel invitation
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="access-note">
            {search
              ? "No pending invitations match your search."
              : "No pending invitations."}
          </p>
        )}
      </section>
      <p className="access-footnote">
        Access changes apply on the next request to the reference. Administrator
        accounts are protected from revocation here. History keeps the latest 8
        changes per account made through this page; earlier dashboard changes
        are not included.
      </p>
    </main>
  );
}
