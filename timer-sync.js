// Enhanced timer synchronization
function onChannelEnteredBridge(event, channel) {
  // ... existing code ...
  
  if (role === "Agent" && session.agentId) {
    // Precise timer start time
    const timerStartTime = new Date().toISOString();
    
    session.updateStatus('connected', {
      bridgeId: bridgeId,
      connectedAt: timerStartTime,
      bridge: event.bridge
    });
    
    // Emit with precise timer info
    io.emit("call_bridged_successfully", {
      sessionId: session.sessionId,
      channelId: channelId,
      agentId: session.agentId,
      extension: session.extension,
      customerNumber: session.customerNumber,
      bridgeId: bridgeId,
      
      // Precise timer synchronization
      timerStartTime: timerStartTime,
      serverTimestamp: Date.now(), // For client-server time sync
      startTimer: true,
      
      // Call metadata
      callIndex: session.callIndex,
      controls: {
        mute: true, hold: true, transfer: true,
        hangup: true, record: true
      }
    });
  }
}