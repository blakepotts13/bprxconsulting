import Link from 'next/link';
export default function CTA() {
  return <section className="cta-band"><div className="shell cta-inner"><div><p className="eyebrow light">START A CONVERSATION</p><h2>Bring the pharmacy problem. Leave with a practical path forward.</h2></div><Link className="button button-light" href="/contact">Request a Consultation</Link></div></section>;
}
