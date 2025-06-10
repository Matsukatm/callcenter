var app = require("express")();
var http = require("http").createServer(app);
app.set("port", process.env.PORT || 4050);



var ari = require("ari-client");
ari.connect("http://localhost:8088", "onfoncc1", "0nfoncc", clientLoaded);



function clientLoaded(err, client) {
    if (err) console.log(err);
    console.log("Client Loaded\n");
    client.start((apps = "onfoncc1"));



    // handler for StasisStart event
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

            console.log('caller = ', mobile);

            // innitiate Ring
            channel.ring(function (err) { });

            channel.answer(function (err) {
                if (err) console.log(err);


                //Get the dialled channel number or Extension Number

                client.channels.getChannelVar(
                    { channelId: channel.id, variable: "CALLERID(dnid)" },
                    function (err, called_no) {
                        console.log(called_no.value, " called number");
                        const called_number = called_no.value;


                    }
                );
      });


        }
    }

    // handler for ChannelStateChange event
    function channelStateChange(event, channel) {
        console.log("Channel %s is now: %s", channel.id, channel.state, mobile);
        if (channel.state == "Up") {
            //Register for DTMF
        }
    }

    // handler for StasisEnd event
    function stasisEnd(event, channel) {



    }



    client.on("StasisEnd", stasisEnd);
    client.on("StasisStart", stasisStart);
    client.on("ChannelStateChange", channelStateChange);


}


var server = http.listen(app.get("port"), "0.0.0.0", function () {
    var host = server.address().address;
    var port = server.address().port;
    console.log("Onfon CCR  listening at http://%s:%s", host, port);
});