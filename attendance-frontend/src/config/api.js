// Create React App only exposes variables prefixed with REACT_APP_.
// The fallback keeps local development working without any extra frontend setup.
const API_URL = process.env.REACT_APP_API_URL || "http://localhost:4000/api/v1";

export default API_URL.replace(/\/$/, "");
