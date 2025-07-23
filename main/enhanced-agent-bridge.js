const EventEmitter = require('events');
const ExternalAPIClient = require('./external-api-client');

class EnhancedAgentBridge extends EventEmitter {
  constructor(config) {
    super();
    
    // Initialize external API client - ALWAYS ENABLED
    this.externalAPI = new ExternalAPIClient(config.externalAPI);
    this.enabled = true;
    
    // Enhanced data structures
    this.agentExtensionMap = new Map();
    this.extensionAgentMap = new Map();
    this.agentStates = new Map();
    this.activeAssignments = new Map(); // Track assignment objects
    this.assignmentMetrics = new Map(); // Track performance data
    
    this.pollInterval = config.agentBridge?.pollInterval || 10000;
    this.isPolling = false;
    
    console.log('🚀 Enhanced Agent Bridge with Assignment Tracking initialized');
    this.startPolling();
  }

  // Start polling for assignments
  startPolling() {
    if (this.isPolling) return;
    
    this.isPolling = true;
    console.log('🔄 Starting enhanced agent bridge polling...');
    
    // Initial fetch
    this.fetchAssignments();
    
    // Poll every 10 seconds
    this.pollTimer = setInterval(() => {
      this.fetchAssignments();
    }, this.pollInterval);
  }

  // Stop polling
  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.isPolling = false;
    console.log('⏹️ Stopped enhanced agent bridge polling');
  }

  // Fetch current assignments from external API
  async fetchAssignments() {
    try {
      const response = await this.externalAPI.getActiveAssignments();
      const assignments = response.data?.assignments || [];
      
      // Clear existing mappings
      this.agentExtensionMap.clear();
      this.extensionAgentMap.clear();
      this.agentStates.clear();
      this.activeAssignments.clear();
      
      // Build enhanced mappings with assignment data
      assignments.forEach(assignment => {
        if (assignment.user_id && assignment.extension?.extension_number) {
          const agentId = assignment.user_id;
          const extension = assignment.extension.extension_number;
          
          this.agentExtensionMap.set(agentId, extension);
          this.extensionAgentMap.set(extension, agentId);
          
          // Store full assignment object
          this.activeAssignments.set(agentId, {
            id: assignment.id,
            extension_id: assignment.extension_id,
            assigned_at: assignment.assigned_at,
            assignment_reason: assignment.assignment_reason,
            assigned_by: assignment.assigned_by,
            metadata: assignment.metadata || {},
            duration_hours: this.calculateCurrentDuration(assignment.assigned_at)
          });
          
          this.agentStates.set(agentId, {
            extension: extension,
            status: assignment.user?.status || 'offline',
            agentName: assignment.user?.name || 'Unknown Agent',
            assignedAt: assignment.assigned_at,
            assignmentReason: assignment.assignment_reason,
            assignmentDuration: this.calculateCurrentDuration(assignment.assigned_at),
            metadata: assignment.metadata,
            lastUpdate: new Date().toISOString()
          });
        }
      });
      
      console.log(`✅ Updated ${assignments.length} agent-extension assignments with metadata`);
      this.emit('assignmentsUpdated', assignments);
      
    } catch (error) {
      console.error('❌ Failed to fetch assignments:', error.message);
    }
  }

  // Get extension for agent
  getExtensionForAgent(agentId) {
    return this.agentExtensionMap.get(agentId) || null;
  }

  // Get agent for extension
  getAgentForExtension(extension) {
    return this.extensionAgentMap.get(extension) || null;
  }

  // Get agent state
  getAgentState(agentId) {
    return this.agentStates.get(agentId) || null;
  }

  // Assign extension to agent
  async assignExtension(agentId, extensionNumber, assignedBy = 'ari_system') {
    try {
      const result = await this.externalAPI.assignExtensionToUser(agentId, extensionNumber, assignedBy);
      
      if (result.success) {
        this.agentExtensionMap.set(agentId, extensionNumber);
        this.extensionAgentMap.set(extensionNumber, agentId);
        
        console.log(`✅ Assigned extension ${extensionNumber} to agent ${agentId}`);
        this.emit('extensionAssigned', { agentId, extensionNumber, assignedBy });
        
        setTimeout(() => this.fetchAssignments(), 1000);
        return result;
      }
      
      throw new Error(result.message || 'Assignment failed');
    } catch (error) {
      console.error(`❌ Failed to assign extension:`, error.message);
      throw error;
    }
  }

  // Release extension from agent
  async releaseExtension(agentId, releaseReason = 'SYSTEM', releasedBy = 'ari_system') {
    try {
      const assignment = this.activeAssignments.get(agentId);
      if (!assignment) {
        throw new Error(`No active assignment found for agent ${agentId}`);
      }

      const result = await this.externalAPI.releaseAssignment(
        assignment.id, 
        releaseReason, 
        releasedBy
      );
      
      if (result.success) {
        const extension = this.getExtensionForAgent(agentId);
        
        // Update local cache
        this.agentExtensionMap.delete(agentId);
        this.extensionAgentMap.delete(extension);
        this.agentStates.delete(agentId);
        this.activeAssignments.delete(agentId);
        
        console.log(`✅ Released assignment ${assignment.id} - extension ${extension} from agent ${agentId}`);
        this.emit('extensionReleased', { 
          agentId, 
          extension, 
          releaseReason,
          releasedBy,
          assignmentId: assignment.id
        });
        
        setTimeout(() => this.fetchAssignments(), 1000);
        return result;
      }
      
      throw new Error(result.message || 'Release failed');
      
    } catch (error) {
      console.error(`❌ Failed to release extension:`, error.message);
      throw error;
    }
  }

  // Enhanced updateAgentStatus for concurrent calls
  async updateAgentStatus(agentId, status, metadata = {}) {
    try {
      const currentState = this.agentStates.get(agentId) || { activeCalls: [] };
      let activeCalls = [...(currentState.activeCalls || [])];
      
      if (status === 'on_call' && metadata.channelId) {
        // Add new call to active calls list
        const existingCall = activeCalls.find(call => call.channelId === metadata.channelId);
        if (!existingCall) {
          activeCalls.push({
            channelId: metadata.channelId,
            sessionId: metadata.sessionId,
            startTime: new Date().toISOString(),
            customerNumber: metadata.customerNumber
          });
        }
      } else if (status === 'available' && metadata.channelId) {
        // Remove ended call from active calls
        activeCalls = activeCalls.filter(call => call.channelId !== metadata.channelId);
      }
      
      // Determine overall agent status based on active calls
      let overallStatus = status;
      if (activeCalls.length > 0) {
        overallStatus = activeCalls.length === 1 ? 'on_call' : 'multi_call';
      } else {
        overallStatus = 'available';
      }
      
      await this.externalAPI.updateAgentState(agentId, overallStatus, {
        ...metadata,
        activeCalls: activeCalls,
        callCount: activeCalls.length
      });
      
      if (this.agentStates.has(agentId)) {
        const state = this.agentStates.get(agentId);
        state.status = overallStatus;
        state.activeCalls = activeCalls;
        state.callCount = activeCalls.length;
        state.lastUpdate = new Date().toISOString();
      }
      
      console.log(`✅ Updated agent ${agentId} status to ${overallStatus} (${activeCalls.length} active calls)`);
      this.emit('agentStatusUpdated', { agentId, status: overallStatus, activeCalls, callCount: activeCalls.length });
      
    } catch (error) {
      console.error(`❌ Failed to update agent status:`, error.message);
    }
  }

  // Get available agents
  getAvailableAgents() {
    const available = [];
    for (const [agentId, state] of this.agentStates.entries()) {
      if (state.status === 'available' || state.status === 'free') {
        available.push({
          agentId,
          extension: state.extension,
          agentName: state.agentName
        });
      }
    }
    return available;
  }

  // Get all extension states
  getAllExtensionStates() {
    const states = {};
    for (const [extension, agentId] of this.extensionAgentMap.entries()) {
      const agentState = this.agentStates.get(agentId);
      states[extension] = {
        agentId,
        status: agentState?.status || 'offline',
        agentName: agentState?.agentName || 'Unknown',
        assignedAt: agentState?.assignedAt,
        lastUpdate: agentState?.lastUpdate
      };
    }
    return states;
  }

  // Add these methods to work with the rich Extension model

  async fetchExtensionDetails() {
    try {
      const response = await this.externalAPI.getAvailableExtensions({
        extension_type: 'AGENT',
        status: 'ACTIVE'
      });
      
      const extensions = response.data?.extensions || [];
      this.extensionDetails = new Map();
      
      extensions.forEach(ext => {
        this.extensionDetails.set(ext.extension_number, {
          id: ext.id,
          display_name: ext.display_name,
          capabilities: ext.capabilities,
          priority: ext.priority,
          max_concurrent_calls: ext.max_concurrent_calls,
          department: ext.department,
          location: ext.location,
          metadata: ext.metadata
        });
      });
      
      console.log(`✅ Loaded details for ${extensions.length} extensions`);
      
    } catch (error) {
      console.error('❌ Failed to fetch extension details:', error.message);
    }
  }

  getExtensionCapabilities(extensionNumber) {
    const details = this.extensionDetails?.get(extensionNumber);
    return details?.capabilities || {};
  }

  canExtensionHandleFeature(extensionNumber, feature) {
    const capabilities = this.getExtensionCapabilities(extensionNumber);
    return capabilities[feature] === true;
  }

  async updateExtensionUsage(extensionNumber, usageData) {
    try {
      await this.externalAPI.updateExtensionMetadata(extensionNumber, {
        performance: {
          ...usageData,
          last_updated: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error(`❌ Failed to update extension usage:`, error.message);
    }
  }

  // Add assignment tracking capabilities

  calculateCurrentDuration(assignedAt) {
    if (!assignedAt) return 0;
    const assignedTime = new Date(assignedAt).getTime();
    return Math.round((Date.now() - assignedTime) / (1000 * 60 * 60) * 100) / 100; // Hours with 2 decimals
  }

  getAssignmentDetails(agentId) {
    return this.activeAssignments.get(agentId) || null;
  }

  async updateAssignmentPerformance(agentId, performanceData) {
    try {
      const assignment = this.activeAssignments.get(agentId);
      if (!assignment) {
        console.warn(`No active assignment found for agent ${agentId}`);
        return;
      }

      const updatedMetadata = {
        ...assignment.metadata,
        performance_data: {
          ...assignment.metadata.performance_data,
          ...performanceData,
          last_updated: new Date().toISOString()
        }
      };

      await this.externalAPI.updateAssignmentMetadata(assignment.id, updatedMetadata);
      
      // Update local cache
      assignment.metadata = updatedMetadata;
      this.activeAssignments.set(agentId, assignment);
      
      console.log(`✅ Updated performance data for agent ${agentId}`);
      this.emit('assignmentPerformanceUpdated', { agentId, performanceData });
      
    } catch (error) {
      console.error(`❌ Failed to update assignment performance:`, error.message);
    }
  }

  async updateAssignmentTechnicalData(agentId, technicalData) {
    try {
      const assignment = this.activeAssignments.get(agentId);
      if (!assignment) return;

      const updatedMetadata = {
        ...assignment.metadata,
        technical_data: {
          ...assignment.metadata.technical_data,
          ...technicalData,
          last_updated: new Date().toISOString()
        }
      };

      await this.externalAPI.updateAssignmentMetadata(assignment.id, updatedMetadata);
      
      assignment.metadata = updatedMetadata;
      this.activeAssignments.set(agentId, assignment);
      
      console.log(`✅ Updated technical data for agent ${agentId}`);
      
    } catch (error) {
      console.error(`❌ Failed to update technical data:`, error.message);
    }
  }

  async getAssignmentStatistics(filters = {}) {
    try {
      const stats = await this.externalAPI.getAssignmentStatistics(filters);
      return stats.data;
    } catch (error) {
      console.error('❌ Failed to get assignment statistics:', error.message);
      return null;
    }
  }

  // Add method to get agent call capacity
  getAgentCallCapacity(agentId) {
    const extension = this.getExtensionForAgent(agentId);
    if (!extension) return { current: 0, max: 0, available: 0 };
    
    const capabilities = this.getExtensionCapabilities(extension);
    const agentState = this.getAgentState(agentId);
    
    const maxCalls = capabilities.max_concurrent_calls || 1;
    const currentCalls = agentState?.callCount || 0;
    const availableCalls = Math.max(0, maxCalls - currentCalls);
    
    return {
      current: currentCalls,
      max: maxCalls,
      available: availableCalls,
      canTakeCall: availableCalls > 0
    };
  }

  // Get all agents with their call capacity
  getAllAgentsWithCapacity() {
    const agents = [];
    for (const [agentId, state] of this.agentStates.entries()) {
      const capacity = this.getAgentCallCapacity(agentId);
      agents.push({
        agentId,
        extension: state.extension,
        agentName: state.agentName,
        status: state.status,
        ...capacity,
        activeCalls: state.activeCalls || []
      });
    }
    return agents;
  }
}

module.exports = EnhancedAgentBridge;
