/**
 * Thin adapter around @simplewebauthn/server.
 *
 * The library exposes its functions as getter properties. Node's test mock
 * tracker can only replace data properties, so tests cannot stub the package
 * object directly. This adapter gives the controller a stable, plain-function
 * surface and keeps every credential-library call in one place.
 */
const server = require("@simplewebauthn/server");

module.exports = {
  generateRegistrationOptions: (...args) =>
    server.generateRegistrationOptions(...args),
  verifyRegistrationResponse: (...args) =>
    server.verifyRegistrationResponse(...args),
  generateAuthenticationOptions: (...args) =>
    server.generateAuthenticationOptions(...args),
  verifyAuthenticationResponse: (...args) =>
    server.verifyAuthenticationResponse(...args),
};
