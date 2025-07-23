// Enhanced call session with better state tracking
class CallSession {
  constructor(sessionId, channelId, agentId, extension, customerNumber) {
    this.sessionId = sessionId;
    this.channelId = channelId;
    this.agentId = agentId;
    this.extension = extension;
    this.customerNumber = customerNumber;
    
    // State tracking
    this.status = 'ringing'; // ringing -> answered -> connected -> ended
    this.timestamps = {
      created: new Date().toISOString(),
      ringing: new Date().toISOString(),
      answered: null,
      connected: null,
      ended: null
    };
    
    // Call metadata
    this.callIndex = 1;
    this.bridgeId = null;
    this.endReason = null;
    this.endedBy = null;
    
    // References
    this.agentChannel = null;
    this.bridge = null;
  }
  
  updateStatus(newStatus, metadata = {}) {
    this.status = newStatus;
    this.timestamps[newStatus] = new Date().toISOString();
    
    // Update metadata
    Object.assign(this, metadata);
    
    console.log(`📊 Session ${this.sessionId} status: ${newStatus}`);
  }
  
  getDuration() {
    if (!this.timestamps.connected) return 0;
    const endTime = this.timestamps.ended ? new Date(this.timestamps.ended) : new Date();
    return Math.floor((endTime - new Date(this.timestamps.connected)) / 1000);
  }
  
  wasAnswered() {
    return this.timestamps.answered !== null;
  }
  
  wasConnected() {
    return this.timestamps.connected !== null;
  }
}

// Usage in handleAgentCall
function handleAgentCall(event, channel, extension) {
  // ... existing code ...
  
  const session = new CallSession(sessionId, channel.id, agentId, extension, customerNumber);
  session.agentChannel = channel;
  session.callIndex = capacity.current + 1;
  
  callSessions.set(sessionId, session);
  
  // Emit with enhanced data
  io.emit("call_incoming", {
    ...session.toJSON(),
    agentName: agentState?.agentName || 'Unknown Agent',
    callerName: channel.caller.name || 'Unknown Caller',
    canAnswer: true,
    canReject: true
  });
}