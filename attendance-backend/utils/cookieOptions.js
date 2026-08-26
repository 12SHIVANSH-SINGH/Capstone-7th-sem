const isProduction = process.env.NODE_ENV === "PRODUCTION" || process.env.NODE_ENV === "production";

const cookieOptions = (expires) => ({
  ...(expires ? { expires } : {}),
  httpOnly: true,
  secure: isProduction,
  // HTTPS is mandatory for cross-site cookies in production; localhost works with Lax.
  sameSite: isProduction ? "none" : "lax",
});

module.exports = cookieOptions;
