# Tester recruitment

Share `/testing` directly with potential testers. The page is unlisted: no navigation or privacy-policy links point to it, and its metadata asks search engines not to index it. This is discoverability control, not authentication; anyone with the URL can open it. It accepts anonymous Android volunteers and iOS waiting-list signups, one platform per signup. The form asks only for a name and email; Android uses the same email for contact and Google Play access. It does not automatically send email or enroll anyone in Google Play or TestFlight.

Deploy the Convex schema/functions and the website to the same environment before sharing the page. No new environment variables are needed; the API uses `NEXT_PUBLIC_CONVEX_URL`.

## Review responses

In the matching Convex dashboard, open Data → testerSignups. This table has no public read API. Filter `android` or `ios` to identify each group and export the table using the dashboard. Each row records consent and its wording version. Exact repeat submissions are ignored; other submissions are retained rather than overwriting an unauthenticated person's earlier details. Deduplicate email addresses when preparing invitations.

For Android, use `googlePlayEmail` to create your tester list in Play Console, then send the opt-in link and instructions to `email`. For iOS, follow up when a TestFlight build is ready. Signup alone does not grant access or satisfy store testing requirements.

Handle removal requests sent to the published contact address by deleting all matching contact/Google Play email rows from the table and any exported lists. These signups are separate from app accounts and are not removed by account deletion. Do not publish exported contact lists. The backend caps new signups at 20 per rolling minute; exact retries do not consume slots.
