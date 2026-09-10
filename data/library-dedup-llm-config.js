/*
  Optional library-deduplication connector.

  Keep `enabled` false until an authenticated server endpoint is available.
  The server should receive the payload from the app, call the chosen LLM with
  its protected API key, and return the response format documented in README.
  Do not add a production API key to this browser file.
*/
window.LIBRARY_DEDUP_LLM_CONFIG = {
  enabled: false,
  endpoint: "",
  model: "",
  transport: "proxy"
};
