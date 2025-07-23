const axios = require('axios');

class ExternalAPIClient {
  constructor(config) {
    this.baseURL = config.baseURL;
    this.apiKey = config.apiKey;
    this.timeout = config.timeout || 10000;
    
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: this.timeout,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    // Add error handling
    this.client.interceptors.response.use(
      response => response,
      error => {
        console.error('❌ External API Error:', error.message);
        throw error;
      }
    );
  }

  // Enhanced syncExtensions with concurrent call support
  async syncExtensions(extensions) {
    const payload = {
      extensions: extensions.map(ext => ({
        extension_number: ext.extension,
        display_name: ext.name || `Extension ${ext.extension}`,
        extension_type: 'AGENT',
        status: 'ACTIVE',
        department: 'GENERAL',
        capabilities: {
          recording: true,
          transfer: true,
          conference: true,
          hold: true,
          call_waiting: true, // Enable call waiting
          caller_id: true,
          voicemail: true,
          multi_line: true, // Support multiple lines
          max_concurrent_calls: 3 // Support up to 3 concurrent calls
        },
        priority: 10,
        max_concurrent_calls: 3, // System-level concurrent call limit
        metadata: {
          hardware: { 
            phone_model: ext.tech || 'PJSIP',
            supports_multiple_calls: true
          },
          network: { 
            ip_address: ext.host || 'dynamic',
            bandwidth_capacity: 'high'
          },
          performance: { 
            uptime_percentage: 99.5,
            concurrent_call_quality: 'excellent'
          },
          concurrent_support: {
            enabled: true,
            max_calls: 3,
            call_waiting: true,
            hold_music: true,
            call_switching: true
          },
          source: 'freepbx_sync'
        }
      })),
      source: 'ari_integration',
      sync_timestamp: new Date().toISOString()
    };

    const response = await this.client.post('/api/extensions/bulk', payload);
    return response.data;
  }

  async getExtensionAssignments() {
    const response = await this.client.get('/api/extensions/assignments');
    return response.data;
  }

  async assignExtensionToUser(userId, extensionNumber, assignedBy = 'ari_system', metadata = {}) {
    const payload = {
      extension_number: extensionNumber,
      assigned_by: assignedBy,
      assignment_reason: 'SYSTEM',
      metadata: {
        assignment_context: {
          assignment_method: 'system',
          department: 'CALL_CENTER',
          ...metadata.assignment_context
        },
        technical_data: {
          connection_quality: 100,
          audio_quality: 95,
          network_latency: 50,
          ...metadata.technical_data
        },
        custom_fields: {
          ari_integration: true,
          assignment_timestamp: new Date().toISOString(),
          ...metadata.custom_fields
        }
      }
    };
    const response = await this.client.post(`/api/users/${userId}/assign-extension`, payload);
    return response.data;
  }

  async releaseExtensionFromUser(userId, releasedBy = 'ari_system') {
    const payload = {
      released_by: releasedBy,
      release_reason: 'SYSTEM'
    };
    const response = await this.client.post(`/api/users/${userId}/release-extension`, payload);
    return response.data;
  }

  // Enhanced updateAgentState with concurrent call metadata
  async updateAgentState(userId, status, metadata = {}) {
    const payload = {
      status,
      metadata: {
        ...metadata,
        updated_by: 'ari_system',
        timestamp: new Date().toISOString(),
        concurrent_calls: {
          active_count: metadata.callCount || 0,
          active_calls: metadata.activeCalls || [],
          max_capacity: metadata.maxCapacity || 1
        }
      }
    };
    const response = await this.client.patch(`/api/users/${userId}/status`, payload);
    return response.data;
  }

  async getExtensionDetails(extensionNumber) {
    const response = await this.client.get(`/api/extensions/${extensionNumber}`);
    return response.data;
  }

  async getAvailableExtensions(filters = {}) {
    const params = new URLSearchParams();
    
    if (filters.extension_type) params.append('extension_type', filters.extension_type);
    if (filters.department) params.append('department', filters.department);
    if (filters.capabilities) params.append('capabilities', filters.capabilities.join(','));
    
    const response = await this.client.get(`/api/extensions/available?${params}`);
    return response.data;
  }

  async updateExtensionStatus(extensionNumber, status, updatedBy = 'ari_system') {
    const payload = {
      status,
      updated_by: updatedBy,
      metadata: {
        last_status_change: new Date().toISOString(),
        changed_by_system: 'ari_integration'
      }
    };
    const response = await this.client.patch(`/api/extensions/${extensionNumber}/status`, payload);
    return response.data;
  }

  async getExtensionUtilizationStats() {
    const response = await this.client.get('/api/extensions/utilization-stats');
    return response.data;
  }

  // Add ExtensionAssignment-specific methods

  async getActiveAssignments(filters = {}) {
    const params = new URLSearchParams();
    
    if (filters.extension_id) params.append('extension_id', filters.extension_id);
    if (filters.user_id) params.append('user_id', filters.user_id);
    if (filters.shift_id) params.append('shift_id', filters.shift_id);
    
    const response = await this.client.get(`/api/extension-assignments/active?${params}`);
    return response.data;
  }

  async getAssignmentHistory(options = {}) {
    const response = await this.client.post('/api/extension-assignments/history', options);
    return response.data;
  }

  async updateAssignmentMetadata(assignmentId, metadata) {
    const payload = { metadata };
    const response = await this.client.patch(`/api/extension-assignments/${assignmentId}/metadata`, payload);
    return response.data;
  }

  async releaseAssignment(assignmentId, releaseReason = 'SYSTEM', releasedBy = 'ari_system') {
    const payload = {
      release_reason: releaseReason,
      released_by: releasedBy
    };
    const response = await this.client.post(`/api/extension-assignments/${assignmentId}/release`, payload);
    return response.data;
  }

  async getAssignmentStatistics(filters = {}) {
    const response = await this.client.post('/api/extension-assignments/statistics', filters);
    return response.data;
  }
}

module.exports = ExternalAPIClient;
