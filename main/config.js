module.exports = {
  // External API Configuration - ENABLED by default
  externalAPI: {
    baseURL: process.env.EXTERNAL_API_URL || 'http://backend-developer-server:3000',
    apiKey: process.env.EXTERNAL_API_KEY || 'your-api-key-here',
    timeout: 15000
  },
  
  // Enhanced Agent Bridge Configuration
  agentBridge: {
    pollInterval: 10000,
    retryAttempts: 3,
    retryDelay: 2000
  },
  
  // FreePBX Configuration - AUTO SYNC ENABLED
  freepbx: {
    syncInterval: 30 * 60 * 1000,
    autoSync: true // ENABLED for automatic sync
  },
  
  // Your existing ARI config
  ari: {
    url: "http://192.168.12.18:8088",
    username: "onfoncc1",
    password: "0nfoncc",
    application: "onfoncc1"
  },
  
  // Your existing queue config
  queue: {
    queueNumber: '5000',
    inboundNumber: '+254709918002'
  },
  
  // Your existing Socket.IO config
  socketIO: {
    cors: {
      origin: "http://197.248.11.234:3001",
      methods: ["GET", "POST"],
      allowedHeaders: ["Content-Type"],
      credentials: true
    }
  }
};