// Shape a user document for the browser. Identity-binding internals are only
// needed by the server; the UI needs the profile and role.
const presentUser = (user) => {
  const source = user?.toObject ? user.toObject() : user || {};
  const { googleSubject, deviceBinding, __v, ...safe } = source;
  return safe;
};

module.exports = presentUser;
