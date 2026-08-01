import ContactForm from "../../components/ContactForm";
import { site } from "../../lib/site";
import { createPageMetadata } from "../../lib/metadata";
export const metadata = createPageMetadata({
  title: "Contact",
  description: "Request a consultation with BPRx Consulting.",
  path: "/contact",
});
export default function Contact() {
  const booking = process.env.NEXT_PUBLIC_BOOKING_URL;
  return (
    <main>
      <section className="page-hero compact">
        <div className="shell narrow">
          <p className="eyebrow light">CONTACT BPRx</p>
          <h1>Start with the problem you need to solve.</h1>
          <p>
            Describe the project, compliance concern, operational challenge, or
            result your organization is pursuing.
          </p>
        </div>
      </section>
      <section className="section shell contact-layout">
        <div>
          <p className="eyebrow">REQUEST A CONSULTATION</p>
          <h2>Tell BPRx what is happening.</h2>
          <p className="large-copy dark">
            A focused initial conversation can clarify scope, likely next steps,
            and whether BPRx is the right fit.
          </p>
          <div className="contact-details">
            <div>
              <span>Email</span>
              <a href={`mailto:${site.email}`}>{site.email}</a>
            </div>
            {booking && (
              <div>
                <span>Schedule directly</span>
                <a href={booking} target="_blank" rel="noreferrer">
                  Open online scheduler ↗
                </a>
              </div>
            )}
            <div>
              <span>Engagements</span>
              <p>
                Remote and on-site support available based on project needs.
              </p>
            </div>
          </div>
        </div>
        <ContactForm />
      </section>
    </main>
  );
}
