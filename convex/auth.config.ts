const domain = process.env.CLERK_JWT_ISSUER_DOMAIN;

if (!domain) {
  throw new Error("Missing CLERK_JWT_ISSUER_DOMAIN for Convex auth provider configuration.");
}

export default {
  providers: [
    {
      domain,
      // Must match the JWT template audience in Clerk.
      applicationID: "convex",
    },
  ],
};
