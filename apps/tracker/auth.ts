import { defineAuth } from "void/auth";

const setting = (value: unknown) => (typeof value === "string" && value !== "" ? value : undefined);

/**
 * Sign-in is Discord only. Without AUTH_DISCORD_CLIENT_ID and AUTH_DISCORD_CLIENT_SECRET the site still runs and
 * nobody can sign in, so you can work on the site without a Discord app.
 */
export default defineAuth(({ defaults, env }) => {
  const clientId = setting(env["AUTH_DISCORD_CLIENT_ID"]);
  const clientSecret = setting(env["AUTH_DISCORD_CLIENT_SECRET"]);
  return {
    ...defaults,
    emailAndPassword: { enabled: false },
    socialProviders:
      clientId !== undefined && clientSecret !== undefined ? { discord: { clientId, clientSecret } } : {},
  };
});
