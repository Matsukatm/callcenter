const ari = require("ari-client");
const config = require("./config");

// Helper to format Kenyan phone numbers
function formatNumber(number) {
    if (number.startsWith("+")) number = number.slice(1);
    if (number.startsWith("0")) number = "254" + number.slice(1);
    if (!number.startsWith("254")) number = "254" + number;
    return number;
}

function makeOutboundCall(destination, callerId = "OnfonCC") {
    // Connect to the ARI Server
    ari.connect(config.ari_url, config.ari_username, config.ari_password, function (err, client) {
        if (err) {
            console.error("❌ ARI connection failed:", err);
            return;
        }

        console.log("✅ Connected to ARI");

        // Start the ARI app
        client.start(config.ari_app_name);

        let endpoint;

        // Determine if it's an internal extension or external number
        if (/^\d{3,5}$/.test(destination)) {
            endpoint = "PJSIP/" + destination; // Agent-to-agent
        } else {
            destination = formatNumber(destination);
            endpoint = `PJSIP/DMA_SAF_SIP/${destination}@DMA_SAF_SIP`; // Agent-to-customer (external)
        }

        const options = {
            endpoint: endpoint,
            app: config.ari_app_name,
            appArgs: "outbound",
            callerId: callerId,
        };

        console.log("📞 Initiating call to:", destination, "\nUsing endpoint:", endpoint);

        // Originate the call
        client.channels.originate(options, function (err, channel) {
            if (err) {
                console.error("❌ Call failed to initiate:", err);
                return;
            }

            console.log("✅ Call request sent to", destination);

            // Handle when the call enters the Stasis app
            channel.on("StasisStart", function (event, channel) {
                console.log("📶 Call connected to app. Channel ID:", channel.id);

                // Optional: Auto-answer the channel (useful in some test cases)
                channel.answer(function (err) {
                    if (err) {
                        console.error("❌ Error answering the call:", err);
                    } else {
                        console.log("✅ Outbound call answered");
                    }
                });
            });

            // Track call state (Ringing, Up, Busy, etc.)
            channel.on("ChannelStateChange", function (event, channel) {
                console.log(`🔄 Call state: ${channel.state}`);
            });

            // Log when the call ends
            channel.on("StasisEnd", function (event, channel) {
                console.log("📴 Call ended. Channel ID:", channel.id);
            });
        });
    });
}

module.exports = { makeOutboundCall };
