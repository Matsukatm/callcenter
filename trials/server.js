const express = require("express");
const app = express();
const http = require("http").createServer(app);
const { makeOutboundCall } = require("./outbound");
const { handleInbound } = require("./inbound");

app.set("port", process.env.PORT || 4050);

// Expose HTTP endpoint to trigger outbound calls
app.get("/call/:number", (req, res) => {
    const number = req.params.number;
    makeOutboundCall(number);
    res.send("Calling " + number);
});

// Start handling inbound calls
handleInbound();

http.listen(app.get("port"), "0.0.0.0", function () {
    const host = http.address().address;
    const port = http.address().port;
    console.log("Server listening at http://%s:%s", host, port);
});
