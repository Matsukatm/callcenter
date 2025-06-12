import React, { useContext, useState } from "react";
import { CallContext } from "../CallContext";

const CallInterface = () => {
  const { role, setRole, currentCall, makeCall, receiveCall, endCall } =
    useContext(CallContext);
  const [target, setTarget] = useState("");

  return (
    <div style={{ border: "1px solid gray", padding: "20px", width: "300px" }}>
      <label>
        Select Role:
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="agent">Agent</option>
          <option value="customer">Customer</option>
        </select>
      </label>

      <div>
        <input
          type="text"
          placeholder="Enter target (e.g. agent2, customer1)"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        />
        <button onClick={() => makeCall(target)}>Call</button>
        <button onClick={() => receiveCall(target)}>Receive</button>
        <button onClick={endCall}>End</button>
      </div>

      {currentCall && (
        <div style={{ marginTop: "20px" }}>
          <p>Call Status:</p>
          {currentCall.status === "calling" && <p>Calling {currentCall.to}...</p>}
          {currentCall.status === "incoming" && <p>Incoming call from {currentCall.from}</p>}
        </div>
      )}
    </div>
  );
};

export default CallInterface;
