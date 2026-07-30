'use client';

import { useState } from 'react';

export default function ContactForm() {
  const [status, setStatus] = useState('idle');

  async function handleSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const endpoint = process.env.NEXT_PUBLIC_FORMSPREE_ENDPOINT;
    if (!endpoint) {
      const data = new FormData(form);
      const subject = encodeURIComponent(`BPRx consultation request from ${data.get('name')}`);
      const body = encodeURIComponent(`Name: ${data.get('name')}\nEmail: ${data.get('email')}\nOrganization: ${data.get('organization')}\nService: ${data.get('service')}\n\n${data.get('message')}`);
      window.location.href = `mailto:blakepotts@bprxconsulting.com?subject=${subject}&body=${body}`;
      return;
    }
    setStatus('sending');
    const response = await fetch(endpoint, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } });
    if (response.ok) { form.reset(); setStatus('success'); } else { setStatus('error'); }
  }

  return (
    <form className="contact-form" onSubmit={handleSubmit}>
      <div className="field-row">
        <label>Name<input name="name" required autoComplete="name" /></label>
        <label>Work email<input name="email" type="email" required autoComplete="email" /></label>
      </div>
      <div className="field-row">
        <label>Organization<input name="organization" autoComplete="organization" /></label>
        <label>Primary need<select name="service" defaultValue=""><option value="" disabled>Select a service</option><option>340B Program Consulting</option><option>Hospital Pharmacy Operations</option><option>USP & Pharmacy Compliance</option><option>Clinical Technology Optimization</option><option>Revenue & Drug Cost Optimization</option><option>Other</option></select></label>
      </div>
      <label>How can BPRx help?<textarea name="message" rows="6" required placeholder="Describe the project, concern, timeline, or result you are trying to achieve." /></label>
      <button className="button" disabled={status === 'sending'}>{status === 'sending' ? 'Sending…' : 'Request Consultation'}</button>
      {status === 'success' && <p className="form-message success">Your request was sent. BPRx will respond by email.</p>}
      {status === 'error' && <p className="form-message error">The form could not be sent. Email blakepotts@bprxconsulting.com directly.</p>}
      <small>By submitting this form, you agree that BPRx may contact you regarding your request. Do not include protected health information.</small>
    </form>
  );
}
