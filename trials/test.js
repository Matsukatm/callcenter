// test.js
const { makeOutboundCall } = require("./outbound");

// Example for internal extension:
makeOutboundCall("PJSIP/1001"); // Assuming 101 is an agent extension

// Example for external number:
makeOutboundCall("0795570351"); // Will be converted to 254712345678
