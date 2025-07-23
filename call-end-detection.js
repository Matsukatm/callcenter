// Enhanced call end detection with better logic
function determineCallEndReason(session, channel) {
  // Check session status first
  if (session.status === 'rejected') {
    return 'agent_rejected';
  }
  
  // Check if call was never answered
  if (!session.wasAnswered()) {
    // If ringing for less than 5 seconds, likely agent rejection
    const ringDuration = (Date.now() - new Date(session.timestamps.ringing)) / 1000;
    if (ringDuration < 5) {
      return 'agent_rejected';
    }
    // Otherwise customer gave up
    return 'customer_left';
  }
  
  // Check if call was answered but never connected to bridge
  if (session.wasAnswered() && !session.wasConnected()) {
    return 'customer_left';
  }
  
  // Check call duration after connection
  if (session.wasConnected()) {
    const callDuration = session.getDuration();
    
    // Very short calls after connection = customer left quickly
    if (callDuration < 3) {
      return 'customer_left';
    }
    
    // Check who ended the call
    if (session.endedBy) {
      return session.endedBy === session.agentId ? 'agent_ended' : 'customer_left';
    }
  }
  
  // Check ARI hangup cause
  if (channel.hangup_cause) {
    const customerCauses = ['NORMAL_CLEARING', 'USER_BUSY', 'NO_ANSWER', 'CALL_REJECTED'];
    if (customerCauses.includes(channel.hangup_cause)) {
      return 'customer_left';
    }
  }
  
  return 'normal';
}