# Production authentication DNS

The website already resolves correctly. The authoritative nameservers are external (`ns-cloud-c1.googledomains.com` through `ns-cloud-c4.googledomains.com`), so these records must be added at the current DNS provider, rather than in Vercel's DNS zone.

Add the following **CNAME** records in the `bprxconsulting.com` zone. These are the exact targets returned by this Clerk production application's domain API on November 16, 2026. Existing website and mail records can remain in place. If the DNS form appends `bprxconsulting.com` automatically, use the short Host column. Use the provider's default TTL.

| Host                  | Full name                                | Target                              |
| --------------------- | ---------------------------------------- | ----------------------------------- |
| `clerk.www`           | `clerk.www.bprxconsulting.com`           | `frontend-api.clerk.services`       |
| `accounts.www`        | `accounts.www.bprxconsulting.com`        | `accounts.clerk.services`           |
| `clkmail.www`         | `clkmail.www.bprxconsulting.com`         | `mail.oxhy9yzlae0s.clerk.services`  |
| `clk._domainkey.www`  | `clk._domainkey.www.bprxconsulting.com`  | `dkim1.oxhy9yzlae0s.clerk.services` |
| `clk2._domainkey.www` | `clk2._domainkey.www.bprxconsulting.com` | `dkim2.oxhy9yzlae0s.clerk.services` |

After publishing the records, confirm them in Clerk's domain settings and wait for certificate provisioning. Verify the production sign-in and verified-email flow before making the new lookup live. A preview uses separate development credentials and does not prove production DNS readiness.
