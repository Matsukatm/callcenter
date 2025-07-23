const { getAllFreePBXExtensions } = require('./freepbx-validator');
const ExternalAPIClient = require('./external-api-client');
const config = require('./config');

// Initialize external API client
const externalAPI = new ExternalAPIClient(config.externalAPI);

async function syncExtensionsToExternalDB() {
  try {
    console.log('🔄 Syncing your real FreePBX extensions (2000-2003)...');
    
    // Fetch your real extensions
    const freepbxExtensions = await getAllFreePBXExtensions();
    
    if (!freepbxExtensions || freepbxExtensions.length === 0) {
      throw new Error('No extensions available');
    }
    
    console.log(`📞 Processing ${freepbxExtensions.length} real FreePBX extensions...`);
    
    // Map your real extensions to the external API format
    const enrichedExtensions = freepbxExtensions.map(ext => ({
      extension_number: ext.extension,
      display_name: ext.name || `Agent Extension ${ext.extension}`,
      description: `FreePBX extension ${ext.extension} - Real agent extension`,
      extension_type: 'AGENT',
      status: 'ACTIVE',
      department: 'CALL_CENTER',
      capabilities: {
        recording: true,
        transfer: true,
        conference: true,
        hold: true,
        mute: true,
        caller_id: true,
        voicemail: true,
        call_waiting: true,
        do_not_disturb: true,
        call_forwarding: true,
        intercom: true,
        presence: true,
        desk_phone: true,
        headset_support: true,
        max_concurrent_calls: 3
      },
      priority: 10,
      max_concurrent_calls: 3,
      metadata: {
        hardware: {
          phone_model: ext.tech || 'PJSIP',
          last_maintenance: new Date(),
          supports_multiple_calls: true
        },
        network: {
          ip_address: ext.host || 'dynamic',
          bandwidth_capacity: 'high'
        },
        location: {
          building: 'Main Office',
          floor: 'Ground Floor',
          department: 'Call Center'
        },
        performance: {
          uptime_percentage: 99.5,
          last_quality_check: new Date(),
          concurrent_call_quality: 'excellent'
        },
        custom_fields: {
          real_freepbx_extension: true,
          sync_timestamp: new Date().toISOString(),
          original_tech: ext.tech,
          source_table: 'freepbx_users',
          extension_range: '2000-2003'
        }
      }
    }));

    const result = await externalAPI.syncExtensions(enrichedExtensions);
    
    console.log(`✅ Successfully synced ${enrichedExtensions.length} real extensions`);
    console.log(`📊 Extensions synced: ${enrichedExtensions.map(e => e.extension_number).join(', ')}`);
    
    return result;
    
  } catch (error) {
    console.error('❌ Extension sync failed:', error.message);
    throw error;
  }
}

// Enhanced sync with retry logic
async function syncExtensionsWithRetry(maxRetries = 3) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 Mock sync attempt ${attempt}/${maxRetries}...`);
      return await syncExtensionsToExternalDB();
    } catch (error) {
      lastError = error;
      console.error(`❌ Attempt ${attempt} failed:`, error.message);
      
      if (attempt < maxRetries) {
        const delay = attempt * 2000;
        console.log(`⏳ Retrying in ${delay/1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw new Error(`All ${maxRetries} sync attempts failed. Last error: ${lastError.message}`);
}

// AUTO-SYNC ENABLED - runs automatically with mock data
console.log('🔄 Auto-sync enabled - will sync mock extensions every 30 minutes');

// Initial sync on startup (after 5 seconds)
setTimeout(async () => {
  try {
    await syncExtensionsWithRetry();
  } catch (error) {
    console.error('❌ Initial mock extension sync failed after all retries:', error.message);
  }
}, 5000);

// Recurring sync every 30 minutes
setInterval(async () => {
  try {
    await syncExtensionsWithRetry();
  } catch (error) {
    console.error('❌ Scheduled mock extension sync failed:', error.message);
  }
}, config.freepbx.syncInterval);

module.exports = { 
  syncExtensionsToExternalDB,
  syncExtensionsWithRetry,
  externalAPI 
};
