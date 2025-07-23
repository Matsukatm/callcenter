const config = require("./config");
const ari = require("ari-client");

function handleInbound() {
    ari.connect(config.ari_url, config.ari_username, config.ari_password, function (err, client) {
        if (err) {
            console.error("ARI connection failed:", err);
            return;
        }

        client.start(config.ari_app_name);

        client.on("StasisStart", function (event, channel) {
            const isDialed = event.args[0] === "dialed";
            if (!isDialed) {
                console.log("Inbound call from:", channel.caller.number);
                channel.answer(err => {
                    if (err) console.error("Error answering:", err);
                });
            }
        });

        client.on("StasisEnd", function (event, channel) {
            console.log("Call ended for channel:", channel.id);
        });
    });
}

module.exports = { handleInbound };
