import Image from "next/image";
import Link from "next/link";

export default function Logo({ inverse = false }) {
  return (
    <Link
      className={`logo ${inverse ? "logo-inverse" : ""}`}
      href="/"
      aria-label="BPRx Consulting home"
    >
      <Image
        className="logo-image"
        src="/bprx-logo-transparent.png"
        alt="BPRx Consulting — Pharmacist Driven Results"
        width={673}
        height={115}
        priority={!inverse}
      />
    </Link>
  );
}
