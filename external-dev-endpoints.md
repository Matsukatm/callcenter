# Required API Endpoints from External Developer

## 1. Extension Update Endpoint
POST /api/extensions/update
- Receives FreePBX extensions from your system
- Updates their database with extension info

## 2. Agent Mappings Endpoint  
GET /api/agents/mappings
- Returns current agent-to-extension mappings
- Your system polls this every 10 seconds

Response format:
{
  "mappings": [
    {
      "agentId": "agent123",
      "extension": "2000", 
      "status": "free",
      "agentName": "John Doe",
      "lastUpdate": "2025-01-21T15:30:00Z"
    }
  ]
}

## 3. Agent State Update Endpoint
POST /api/agents/state/update  
- Receives agent state changes from your ARI system
- Updates agent status (free/busy/ringing/offline)

Request format:
{
  "agentId": "agent123",
  "extension": "2000",
  "status": "busy",
  "callId": "channel-id-123", 
  "timestamp": "2025-01-21T15:30:00Z"
}