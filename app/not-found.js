import Link from "next/link";
export default function NotFound() {
  return (
    <main className="not-found shell">
      <p className="eyebrow">404</p>
      <h1>Page not found.</h1>
      <p>The page may have moved or no longer exists.</p>
      <Link className="button" href="/">
        Return Home
      </Link>
    </main>
  );
}
