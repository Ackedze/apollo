// A scoped refresh also runs contract capture and Proxy verification.
// Keep its budget separate from a native-only read or mutation.
const REFRESH_TIMEOUT_MS=60000,REFRESH_CLIENT_TIMEOUT_MS=65000,DISPLAY_METADATA_BUDGET_MS=1000;
module.exports={REFRESH_TIMEOUT_MS,REFRESH_CLIENT_TIMEOUT_MS,DISPLAY_METADATA_BUDGET_MS};
