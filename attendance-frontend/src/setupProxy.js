const { createProxyMiddleware } = require("http-proxy-middleware");

// Used only by `npm run start:shared`. A secure tunnel can expose the React
// development server while this proxy keeps API requests on the same origin.
module.exports = function setupProxy(app) {
  app.use(
    "/api",
    createProxyMiddleware({
      target: process.env.BACKEND_PROXY_URL || "http://127.0.0.1:4000",
      changeOrigin: false,
    })
  );
};
