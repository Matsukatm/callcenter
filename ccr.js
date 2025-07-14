const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const cors = require("cors");
const fs = require("fs");
const ariClientLib = require("ari-client");

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "http://197.248.11.234:3001",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
    credentials: true,
  },
});

app.use(cors());
app.use(express.json());
app.set("port", process.env.PORT || 4050);

let ariClient = null;
let callSessions = new Map(); // Map<channelId, { incomingChannel, agentChannel, bridge }>

// Connect to ARI
ariClientLib.connect("http://192.168.12.18:8088", "onfoncc1", "0nfoncc", (err, client) => {
  if (err) {
    console.error("❌ ARI connection failed:", err);
    return;
  }
  ariClient = client;
  clientLoaded(client);
});

function clientLoaded(client) {
  console.log("✅ ARI Client Connected");
  client.start("onfoncc1");

  client.on("StasisStart", stasisStart);
  client.on("ChannelStateChange", channelStateChange);
  client.on("StasisEnd", stasisEnd);
  client.on("ChannelEnteredBridge", onChannelEnteredBridge);
}

function stasisStart(event, channel) {
  const dialed = event.args[0] === "dialed";
  if (dialed) return;

  let mobile = channel.caller.number.replace("+", "");
  if (mobile.length > 4 && !mobile.startsWith("254")) {
    mobile = "254" + mobile;
  }

  const channelId = channel.id;
  const channelName = channel.name;
  const match = channelName.match(/(\d+)-(\d+)/);
  let extension = match ? match[1] : "unknown";

  channel.ring((err) => {
    if (err) console.error("Ring error:", err);
  });

  ariClient.channels.getChannelVar({ channelId, variable: "CALLERID(dnid)" }, (err, called_no) => {
    if (err) {
      console.error("Error getting called number:", err);
      return;
    }

    const payload = {
      callId: channelId,
      channelId: channelId,
      callerNumber: mobile,
      callerName: "John Doe",
      destinationNumber: called_no.value || "+254709918002",
      direction: "Inbound",
      status: "Ringing",
      startTime: new Date().toISOString(),
      agentExtension: extension,
    };

    callSessions.set(channelId, { incomingChannel: channel });
    io.emit("incoming_call", payload);
    console.log("📞 Incoming call payload sent to frontend:", payload);
  });
}

app.post("/api/answer", (req, res) => {
  console.log("📥 /api/answer HIT with body:", req.body);
  const { channelId } = req.body;

  if (!ariClient) return res.status(500).send("ARI client not initialized");
  if (!channelId || !callSessions.has(channelId)) return res.status(400).send("Invalid or unknown call");

  ariClient.channels.get({ channelId }, (err, agentChannel) => {
    if (err) {
      console.error("❌ Error getting agent channel:", err);
      return res.status(500).send("Channel not found");
    }

    agentChannel.answer((err) => {
      if (err) {
        console.error("❌ Agent answer error:", err);
        return res.status(500).send("Failed to answer");
      }

      console.log("🔔 Agent answered:", agentChannel.id);
      const session = callSessions.get(channelId);
      session.agentChannel = agentChannel;
      callSessions.set(agentChannel.id, session); // fix #2: map by agent channel id

      ariClient.bridges.create({ type: "mixing" }, (err, bridge) => {
        if (err) {
          console.error("❌ Bridge creation error:", err);
          return res.status(500).send("Bridge failed");
        }

        session.bridge = bridge;

        bridge.addChannel({ channel: [session.incomingChannel.id, agentChannel.id] }, (err) => {
          if (err) {
            console.error("❌ Bridge add failed:", err);
            return res.status(500).send("Could not bridge call");
          }

          console.log("🔗 Bridged call for", channelId);
          io.emit("call_bridged", {
            callId: channelId,
            caller: session.incomingChannel.id,
            agent: agentChannel.id,
            bridgeId: bridge.id,
          });
          res.send("Call bridged successfully");
        });
      });
    });
  });
});

function stasisEnd(event, channel) {
  const channelId = channel.id;
  console.log("📴 Call ended for channel:", channelId);

  const session = callSessions.get(channelId);
  if (session && session.bridge) {
    session.bridge.destroy((err) => {
      if (err) console.error("Bridge destroy error:", err);
      else console.log("🔌 Bridge destroyed");
    });
  }

  callSessions.delete(channelId);
}

function channelStateChange(event, channel) {
  console.log("🔁 Channel state changed:", channel.id, channel.state);
}

function onChannelEnteredBridge(event, channel) {
  const bridgeId = event.bridge.id;

  const channelId = channel?.id || event.channel?.id;
  if (!channelId) return console.warn("⚠️ Channel ID missing in bridge event");

  const session = callSessions.get(channelId);
  if (session) {
    const role = session.incomingChannel?.id === channelId ? "Caller" : "Agent";
    console.log(`🎧 ${role} channel (${channelId}) entered bridge ${bridgeId}`);
  } else {
    console.log(`🎧 Channel ${channelId} entered bridge ${bridgeId} (no session match)`);
  }
}

io.on("connection", (socket) => {
  console.log("🔗 Frontend connected:", socket.id);
  socket.on("disconnect", () => {
    console.log("❌ Frontend disconnected:", socket.id);
  });
});

app.get("/", (req, res) => {
  res.send("🟢 Onfon CCR running. WebSocket and ARI are ready.");
});

server.listen(app.get("port"), "0.0.0.0", () => {
  const { address, port } = server.address();
  console.log(`🚀 Onfon CCR listening at http://${address}:${port}`);
});
