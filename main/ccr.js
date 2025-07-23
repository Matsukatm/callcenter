const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const cors = require("cors");
const ariClientLib = require("ari-client");
const config = require('./config');
const EnhancedAgentBridge = require('./enhanced-agent-bridge');
const { syncExtensionsToExternalDB } = require('./extension-sync');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());
app.set("port", process.env.PORT || 4050);

// Core variables
let ariClient = null;
let callSessions = new Map();
const agentBridge = new EnhancedAgentBridge(config);

// ARI Connection
ariClientLib.connect(config.ari.url, config.ari.username, config.ari.password, (err, client) => {
  if (err) {
    console.error("❌ ARI connection failed:", err);
    return;
  }
  ariClient = client;
  clientLoaded(client);
});

function clientLoaded(client) {
  console.log("✅ ARI Client Connected");
  client.start(config.ari.application);

  client.on("StasisStart", stasisStart);
  client.on("ChannelStateChange", channelStateChange);
  client.on("StasisEnd", stasisEnd);
  client.on("ChannelEnteredBridge", onChannelEnteredBridge);
}

function stasisStart(event, channel) {
  console.log("🔥 Stasis Start Event:", {
    channelId: channel.id,
    channelName: channel.name,
    callerNumber: channel.caller.number
  });

  const dialed = event.args[0] === "dialed";
  if (dialed) return;

  const extension = extractExtension(channel.name);
  
  if (extension) {
    // This is a call to an agent extension - USE ENHANCED BRIDGE
    handleAgentCall(event, channel, extension);
  } else {
    // This is an incoming queue call
    handleIncomingQueueCall(event, channel);
  }
}

// 1️⃣ INCOMING CALL EVENT - Change from "call_incoming" to "incoming_call"
function handleAgentCall(event, channel, extension) {
  console.log(`🎯 Call to extension ${extension}`);
  
  const agentId = agentBridge.getAgentForExtension(extension);
  const agentState = agentBridge.getAgentState(agentId);
  
  if (agentId) {
    const capacity = agentBridge.getAgentCallCapacity(agentId);
    
    if (!capacity.canTakeCall) {
      console.log(`⚠️ Agent ${agentId} at max capacity`);
      handleIncomingQueueCall(event, channel);
      return;
    }
    
    const sessionId = `${channel.id}_${Date.now()}`;
    const callData = {
      sessionId: sessionId,
      channelId: channel.id,
      agentChannel: channel,
      extension: extension,
      agentId: agentId,
      type: 'agent_ringing',
      customerNumber: normalizePhoneNumber(channel.caller.number),
      callIndex: capacity.current + 1,
      startTime: new Date().toISOString(),
      status: 'ringing'
    };
    
    callSessions.set(sessionId, callData);

    // Update agent status
    agentBridge.updateAgentStatus(agentId, 'ringing', { 
      channelId: channel.id,
      sessionId: sessionId,
      callerNumber: normalizePhoneNumber(channel.caller.number)
    });

    // 🚀 FRONTEND EVENT - incoming_call (CHANGED)
    io.emit("incoming_call", {
      sessionId: sessionId,
      channelId: channel.id,
      agentId: agentId,
      extension: extension,
      agentName: agentState?.agentName || 'Unknown Agent',
      customerNumber: normalizePhoneNumber(channel.caller.number),
      callerName: channel.caller.name || 'Unknown Caller',
      callIndex: capacity.current + 1,
      maxCalls: capacity.max,
      timestamp: new Date().toISOString(),
      callDirection: 'inbound',
      priority: 'normal',
      canAnswer: true,
      canReject: true,
      canTransfer: true
    });
    
    console.log(`📡 WebSocket: incoming_call emitted for agent ${agentId}`);
  }
}

// 4️⃣ QUEUE CALL EVENT - Change from "incoming_call" to "incoming_call" (already correct)
function handleIncomingQueueCall(event, channel) {
  const mobile = normalizePhoneNumber(channel.caller.number);
  const channelId = channel.id;
  
  channel.ring((err) => {
    if (err) console.error("Ring error:", err);
  });

  // Get available agents from external DB
  const availableAgents = agentBridge.getAvailableAgents();
  
  console.log(`📞 Incoming call from ${mobile}, ${availableAgents.length} agents available`);
  
  callSessions.set(channelId, {
    incomingChannel: channel,
    type: 'queue_incoming',
    startTime: new Date().toISOString(),
    customerNumber: mobile,
    availableAgents: availableAgents
  });

  // 🚀 FRONTEND EVENT - incoming_call (CORRECT)
  io.emit("incoming_call", {
    channelId: channelId,
    customerNumber: mobile,
    availableAgents: availableAgents,
    timestamp: new Date().toISOString(),
    callType: 'queue',
    queuePosition: 1,
    estimatedWaitTime: 45,
    actions: {
      assignToAgent: true,
      setPriority: true,
      transfer: true,
      hangup: true
    }
  });
}

// 2️⃣ BRIDGE SUCCESS EVENT - Change from "call_bridged_successfully" to "call_bridged"
function onChannelEnteredBridge(event, { bridge, channel }) {
  const channelId = channel.id;
  const bridgeId = bridge.id;
  
  console.log(`🌉 Channel ${channelId} entered bridge ${bridgeId}`);
  
  // Find session
  let session = null;
  let sessionKey = null;
  
  for (const [key, sess] of callSessions.entries()) {
    if (sess.channelId === channelId) {
      session = sess;
      sessionKey = key;
      break;
    }
  }
  
  if (!session) return;
  
  const role = determineChannelRole(channel, session);
  
  // When agent channel enters bridge = call is connected
  if (role === "Agent" && session.agentId) {
    // Update session status
    session.status = 'connected';
    session.bridgeId = bridgeId;
    session.connectedAt = new Date().toISOString();
    session.bridge = event.bridge;
    
    // Update agent status
    agentBridge.updateAgentStatus(session.agentId, 'on_call', {
      channelId: channelId,
      sessionId: session.sessionId,
      customerNumber: session.customerNumber
    });

    // 🚀 FRONTEND EVENT - call_bridged (CHANGED)
    io.emit("call_bridged", {
      sessionId: session.sessionId,
      channelId: channelId,
      bridgeId: bridgeId,
      agentId: session.agentId,
      extension: session.extension,
      customerNumber: session.customerNumber,
      callIndex: session.callIndex,
      connectedAt: session.connectedAt,
      startTimer: true,
      timerStartTime: session.connectedAt,
      serverTimestamp: Date.now(),
      controls: {
        mute: true,
        hold: true,
        transfer: true,
        hangup: true,
        record: true,
        conference: false
      }
    });
    
    console.log(`📡 WebSocket: call_bridged emitted for agent ${session.agentId}`);
  }
}

// 3️⃣ CALL END EVENT - Change to "sip_call_ended" for ALL endings
function stasisEnd(event, channel) {
  const channelId = channel.id;
  console.log("📴 Call ended for channel:", channelId);

  // Find and remove session
  let endedSession = null;
  let sessionKey = null;
  
  for (const [key, session] of callSessions.entries()) {
    if (session.channelId === channelId) {
      endedSession = session;
      sessionKey = key;
      break;
    }
  }
  
  if (endedSession) {
    const callDuration = endedSession.connectedAt 
      ? Math.floor((Date.now() - new Date(endedSession.connectedAt).getTime()) / 1000)
      : 0;
    
    // Determine who ended the call
    const endReason = determineCallEndReason(endedSession, channel);
    
    // Update agent status
    if (endedSession.agentId) {
      agentBridge.updateAgentStatus(endedSession.agentId, 'available', {
        channelId: channelId,
        sessionId: endedSession.sessionId
      });
      console.log(`🟢 Agent ${endedSession.agentId} call ${endedSession.callIndex} ended`);
    }
    
    // Cleanup bridge
    if (endedSession.bridge) {
      endedSession.bridge.destroy((err) => {
        if (err) console.error("Bridge destroy error:", err);
      });
    }

    // 🚀 FRONTEND EVENT - sip_call_ended (UNIFIED EVENT)
    io.emit("sip_call_ended", {
      sessionId: endedSession.sessionId,
      channelId: channelId,
      agentId: endedSession.agentId,
      extension: endedSession.extension,
      customerNumber: endedSession.customerNumber,
      endedAt: new Date().toISOString(),
      endReason: endReason, // 'customer_left', 'agent_rejected', 'normal'
      callDuration: callDuration,
      totalDuration: endedSession.startTime 
        ? Math.floor((Date.now() - new Date(endedSession.startTime).getTime()) / 1000)
        : callDuration,
      wasConnected: endedSession.status === 'connected',
      wasAnswered: endedSession.status !== 'ringing',
      callIndex: endedSession.callIndex,
      bridgeId: endedSession.bridgeId,
      // Additional context for frontend
      autoDecline: endReason === 'customer_left',
      quality: {
        audioQuality: "good",
        connectionStable: true,
        dropouts: 0
      }
    });
    
    console.log(`📡 WebSocket: sip_call_ended emitted - ${endReason}`);
    
    // Remove session
    callSessions.delete(sessionKey);
  }
}

function channelStateChange(event, channel) {
  const channelId = channel.id;
  const newState = event.channel.state;
  const extension = extractExtension(channel.name);
  
  console.log(`📞 Channel ${channelId} state changed to: ${newState}`);
  
  if (extension) {
    const agentId = agentBridge.getAgentForExtension(extension);
    
    if (agentId) {
      // Update assignment performance data based on call state
      handleCallStateForAssignment(agentId, newState, channel);
    }
  }
  
  // Update call session
  if (callSessions.has(channelId)) {
    const session = callSessions.get(channelId);
    session.currentState = newState;
    session.stateHistory = session.stateHistory || [];
    session.stateHistory.push({
      state: newState,
      timestamp: new Date().toISOString()
    });
    callSessions.set(channelId, session);
  }
  
  io.emit("channel_state_change", {
    channelId,
    newState,
    extension,
    timestamp: new Date().toISOString()
  });
}

async function handleCallStateForAssignment(agentId, callState, channel) {
  try {
    const assignment = agentBridge.getAssignmentDetails(agentId);
    if (!assignment) return;
    
    const performanceUpdate = {};
    const technicalUpdate = {};
    
    switch (callState) {
      case 'Up':
        // Call answered
        performanceUpdate.calls_handled = (assignment.metadata.performance_data?.calls_handled || 0) + 1;
        technicalUpdate.connection_quality = 95; // You can implement actual quality detection
        
        await agentBridge.updateAgentStatus(agentId, 'on_call', {
          channelId: channel.id,
          callStartTime: new Date().toISOString(),
          customerNumber: normalizePhoneNumber(channel.caller.number)
        });
        break;
        
      case 'Ringing':
        await agentBridge.updateAgentStatus(agentId, 'ringing', {
          channelId: channel.id,
          customerNumber: normalizePhoneNumber(channel.caller.number)
        });
        break;
        
      case 'Down':
        // Call ended - calculate duration and update stats
        const callSession = callSessions.get(channel.id);
        if (callSession && callSession.callStartTime) {
          const duration = (Date.now() - new Date(callSession.callStartTime).getTime()) / 1000;
          performanceUpdate.avg_call_duration = duration;
        }
        
        await agentBridge.updateAgentStatus(agentId, 'available');
        break;
    }
    
    // Update assignment metadata
    if (Object.keys(performanceUpdate).length > 0) {
      await agentBridge.updateAssignmentPerformance(agentId, performanceUpdate);
    }
    
    if (Object.keys(technicalUpdate).length > 0) {
      await agentBridge.updateAssignmentTechnicalData(agentId, technicalUpdate);
    }
    
  } catch (error) {
    console.error('❌ Failed to update assignment data:', error.message);
  }
}

// Utility functions
function extractExtension(channelName) {
  // Extract extension from channel name (e.g., PJSIP/2000-00000001)
  const match = channelName.match(/PJSIP\/(\d+)-/);
  return match ? match[1] : null;
}

function normalizePhoneNumber(number) {
  if (!number) return 'Unknown';
  let mobile = number.replace("+", "");
  if (mobile.length > 4 && !mobile.startsWith("254")) {
    mobile = "254" + mobile;
  }
  return mobile;
}

function determineCallEndReason(session, channel) {
  if (!session.connectedAt) return 'agent_rejected';
  if (session.status === 'connected') return 'normal';
  return 'customer_left';
}

function determineChannelRole(channel, session) {
  const extension = extractExtension(channel.name);
  return extension ? "Agent" : "Customer";
}

// Listen for enhanced agent bridge events
agentBridge.on('assignmentsUpdated', (assignments) => {
  console.log(`🔄 Agent assignments updated: ${assignments.length} assignments`);
  
  io.emit('agent_assignments_updated', {
    totalAssignments: assignments.length,
    assignments: assignments,
    timestamp: new Date().toISOString()
  });
});

agentBridge.on('extensionAssigned', (data) => {
  console.log(`🔄 Extension assigned: ${data.extensionNumber} -> ${data.agentId}`);
  io.emit('extension_assigned', data);
});

// 6️⃣ AGENT STATUS UPDATES - Keep existing (correct)
agentBridge.on('agentStatusUpdated', (data) => {
  console.log(`🔄 Agent status updated: ${data.agentId} -> ${data.status}`);
  io.emit('agent_status_updated', data); // KEEP AS IS
});

// 5️⃣ WEBSOCKET CONNECTION - Keep existing events (they're correct)
io.on("connection", (socket) => {
  console.log("🔗 Frontend connected:", socket.id);
  
  // Send current system state immediately - KEEP AS IS
  socket.emit("system_state", {
    extensionStates: agentBridge.getAllExtensionStates(),
    availableAgents: agentBridge.getAvailableAgents(),
    agentsWithCapacity: agentBridge.getAllAgentsWithCapacity(),
    activeCalls: Array.from(callSessions.values()).map(session => ({
      sessionId: session.sessionId,
      channelId: session.channelId,
      agentId: session.agentId,
      extension: session.extension,
      customerNumber: session.customerNumber,
      callType: session.type,
      callIndex: session.callIndex,
      startTime: session.startTime
    })),
    timestamp: new Date().toISOString()
  });
  
  // Handle manual call assignment - ADD RESPONSE EVENTS
  socket.on("assign_call_to_agent", async (data) => {
    const { channelId, agentId, priority = false } = data;
    
    try {
      const capacity = agentBridge.getAgentCallCapacity(agentId);
      
      if (!capacity.canTakeCall && !priority) {
        socket.emit("assignment_failed", {
          error: "Agent at maximum call capacity",
          agentId,
          capacity
        });
        return;
      }
      
      // Find the call session
      let targetSession = null;
      for (const [sessionId, session] of callSessions.entries()) {
        if (session.channelId === channelId) {
          targetSession = session;
          break;
        }
      }
      
      if (targetSession) {
        // Update session with new agent assignment
        targetSession.agentId = agentId;
        targetSession.assignedManually = true;
        targetSession.assignmentTime = new Date().toISOString();
        
        // 🚀 FRONTEND EVENTS - Add these response events
        socket.emit("call_answered", {
          sessionId: targetSession.sessionId,
          channelId,
          agentId,
          capacity: agentBridge.getAgentCallCapacity(agentId)
        });
        
        // Broadcast to all clients
        io.emit("call_answered", {
          sessionId: targetSession.sessionId,
          channelId,
          agentId,
          assignedManually: true
        });
      }
      
    } catch (error) {
      socket.emit("call_rejected", {
        error: error.message,
        channelId,
        agentId
      });
    }
  });
  
  socket.on("disconnect", () => {
    console.log("❌ Frontend disconnected:", socket.id);
  });
});

// API endpoints (keep only essential ones)
app.get("/api/agents", async (req, res) => {
  try {
    const agents = agentBridge.getAvailableAgents();
    res.json({ success: true, agents });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/sync/extensions", async (req, res) => {
  try {
    const result = await syncExtensionsToExternalDB();
    res.json({ success: true, message: "Extensions synced", data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// System stats (keep this)
setInterval(() => {
  const stats = {
    totalSessions: callSessions.size,
    activeAgents: new Set([...callSessions.values()].map(s => s.agentId).filter(Boolean)).size,
    timestamp: new Date().toISOString()
  };
  io.emit('system_stats', stats);
}, 30000);

// Startup sequence
async function startup() {
  console.log('🚀 Starting Enhanced CCR System...');
  
  try {
    // Sync extensions on startup
    console.log('1️⃣ Syncing FreePBX extensions...');
    await syncExtensionsToExternalDB();
    
    console.log('✅ Enhanced CCR System started successfully!');
  } catch (error) {
    console.error('❌ Startup failed:', error);
  }
}

// Start server
server.listen(app.get("port"), () => {
  console.log(`🚀 Enhanced CCR Server running on port ${app.get("port")}`);
  startup();
});
