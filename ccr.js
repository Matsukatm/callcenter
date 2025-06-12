var app = require("express")();
var http = require("http").createServer(app);
app.set("port", process.env.PORT || 4050);


//Websocket setup using socket.io
var io = require("socket.io")(http, {
    cors: {
        origin: "*",  // Allow frontend to connect
        methods: ["GET", "POST"],
        allowedHeaders: ["my-custom-header"],
        credentials: true
    }
});

const axios = require("axios"); // For sending data to external api

app.set("port", process.env.PORT || 4050);

//Connect to Asterisk ARI
var ari = require("ari-client");


//ARI connection info
ari.connect("http://192.168.12.18:8088", "onfoncc1", "0nfoncc", clientLoaded);

// store active sockets to broadcast to
let connectedClients = [];


//ARI clienrt loaded callback

function clientLoaded(err, client) {
    if (err) {
        console.error("Error connecting to ARI:", err);
        return;
    }

    console.log("✅ ARI Client Connected");

    //Listen to app name
    client.start((apps = "onfoncc1"));



    // STASIS: when a new call enters our app

    function stasisStart(event, channel) {
        // ensure the channel is not a dialed channel
        var dialed = event.args[0] === "dialed";

        console.log('channel\n' + channel)

        if (!dialed) {


            mobile = channel.caller.number;
            mobile = mobile.replace("+", "");
            if (mobile.length > 4) {
                if (mobile.substring(0, 3) != "254") {
                    mobile = "254" + mobile;
                }
            }

            console.log("📞 Incoming call from:", mobile);

            // Ring the channel and then answer
            channel.ring((err) => {
            if (err) console.error("Ring error:", err);
            });

            channel.answer((err) => {
            if (err) {
            console.error("Answer error:", err);
            return;
            }

                //Get the dialled channel number or Extension Number

                client.channels.getChannelVar(
                    { channelId: channel.id, variable: "CALLERID(dnid)" },
                    function (err, called_no) {
                        if (err) {
                            console.error("Error getting called number:", err);
                            return;
                        }


                        //console.log(called_no.value, " called number");
                        
                        
                        const called_number = called_no.value;


                        //payload
                        const payload = {
                            mobile: mobile,
                            called_number: called_number,
                            channel_id: channel.id,
                            call_direction: "Inbound",
                        };

                        //emit  to all frontend via websocket
                        io.emit("incoming_call", payload);  //frontend listens here
                        console.log("📞 Incoming call payload sent to frontend:", payload);

                        //send to backend for storage
                        axios.post("http://external-api-url/api/call-logs", payload)
                            .then(response => {
                                console.log("📞 Incoming call data sent to backend:", response.data);
                            })
                            .catch(error => {
                                console.error("Error sending incoming call data to backend:", error);
                            });


                    }
                );
      });


        }
    }

    // handler for ChannelStateChange event
    function channelStateChange(event, channel) {
        console.log("Channel %s is now: %s", channel.id, channel.state, mobile);
    }

    // handle end of call
    function stasisEnd(event, channel) {
        console.log("Call ended for channel:", channel.id);
    }


    // Register event handlers
    client.on("StasisEnd", stasisEnd);
    client.on("StasisStart", stasisStart);
    client.on("ChannelStateChange", channelStateChange);


}

// Websocket: track clients
io.on("connection", (socket) => {
  console.log("🔗 Frontend connected:", socket.id);

  connectedClients.push(socket);

  socket.on("disconnect", () => {
    console.log("❌ Frontend disconnected:", socket.id);
    connectedClients = connectedClients.filter((s) => s.id !== socket.id);
  });
});

var server = http.listen(app.get("port"), "0.0.0.0", function () {
    var host = server.address().address;
    var port = server.address().port;
    console.log("Onfon CCR  listening at http://%s:%s", host, port);
});