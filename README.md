# BPRx Consulting Website

A Vercel-ready Next.js website for BPRx Consulting.

## Deploy to Vercel

1. Extract this folder and upload it to a GitHub repository.
2. In Vercel, select **Add New → Project** and import the repository.
3. Keep the detected framework as **Next.js** and select **Deploy**.
4. In **Project Settings → Domains**, add `bprxconsulting.com` and `www.bprxconsulting.com`.
5. Update the domain DNS records exactly as Vercel instructs. Set `www.bprxconsulting.com` as the preferred domain if desired.

## Contact form

The form works immediately by opening a pre-filled email to `blakepotts@bprxconsulting.com`.

For an embedded form submission experience:

1. Create a Formspree form.
2. Add `NEXT_PUBLIC_FORMSPREE_ENDPOINT` in Vercel under **Settings → Environment Variables**.
3. Use the endpoint format shown in `.env.example`.

## Scheduling

Add a Calendly or Microsoft Bookings URL as `NEXT_PUBLIC_BOOKING_URL` in Vercel. The scheduling link will then appear automatically on the contact page.

## Editing content

- Company details: `lib/site.js`
- Services: `lib/services.js`
- Resources/articles: `lib/resources.js`
- Homepage: `app/page.js`
- Site styling: `app/globals.css`

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.


## Original BPRx logo assets

The uploaded original black-and-white BPRx Consulting wordmark is used in the header and footer.

- `public/bprx-logo-original.png` — exact uploaded artwork
- `public/bprx-logo-transparent.png` — transparent monochrome web version
- `public/og-image.png` — social-sharing image
- `public/apple-touch-icon.png` — mobile bookmark icon
