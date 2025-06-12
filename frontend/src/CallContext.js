import React, { createContext, useState } from "react";

export const CallContext = createContext();

export const CallProvider = ({ children }) => {
  const [currentCall, setCurrentCall] = useState(null);
  const [role, setRole] = useState("agent"); // agent or customer

  const makeCall = (recipient) => {
    setCurrentCall({ to: recipient, status: "calling" });
    // Hook to WebRTC signaling server here
  };

  const receiveCall = (from) => {
    setCurrentCall({ from, status: "incoming" });
    // Hook to WebRTC signaling server here
  };

  const endCall = () => setCurrentCall(null);

  return (
    <CallContext.Provider
      value={{ role, setRole, currentCall, makeCall, receiveCall, endCall }}
    >
      {children}
    </CallContext.Provider>
  );
};
