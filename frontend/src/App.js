import React from "react";
import { CallProvider } from "./CallContext";
import CallInterface from "./components/CallInterface";

function App() {
  return (
    <CallProvider>
      <div className="app">
        <h1>Call Simulation App</h1>
        <CallInterface />
      </div>
    </CallProvider>
  );
}

export default App;
