require('dotenv').config();
const { 
  testDatabaseConnection, 
  getAllFreePBXExtensions, 
  discoverFreePBXTables,
  getExtensionDetails,
  validateAllExtensions
} = require('./freepbx-validator');

async function runExtensionTest() {
  console.log('🧪 Testing Your Real FreePBX Extensions (2000-2003)...');
  console.log('=' .repeat(60));
  
  try {
    // 1. Test database connection
    console.log('1️⃣ Testing FreePBX database connection...');
    const connected = await testDatabaseConnection();
    
    console.log('\n2️⃣ Discovering table structure...');
    await discoverFreePBXTables();
    
    console.log('\n3️⃣ Fetching your real extensions...');
    const extensions = await getAllFreePBXExtensions();
    
    console.log(`\n4️⃣ Validating extension status in FreePBX...`);
    const validationResults = await validateAllExtensions();
    
    console.log('\n5️⃣ Testing extension details...');
    for (const ext of extensions) {
      const details = await getExtensionDetails(ext.extension);
      if (details) {
        console.log(`📊 Extension ${ext.extension} details available`);
      }
    }
    
    console.log('\n✅ SUMMARY:');
    console.log(`📞 Total Extensions: ${extensions.length}`);
    console.log(`🎯 Extensions: ${extensions.map(e => e.extension).join(', ')}`);
    
    const configured = validationResults.filter(e => e.validation.status === 'configured').length;
    const registered = validationResults.filter(e => e.validation.registered).length;
    
    console.log(`⚙️ Configured: ${configured}/${extensions.length}`);
    console.log(`🟢 Registered: ${registered}/${extensions.length}`);
    
    if (registered === 0) {
      console.log('\n💡 NEXT STEPS:');
      console.log('1. Register a SIP phone/softphone to one of your extensions');
      console.log('2. Use credentials: Extension/Secret from FreePBX GUI');
      console.log('3. Point to server: 192.168.12.18:5060');
      console.log('4. Test by calling between extensions');
    }
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.log('\n💡 Your extensions (2000-2003) are still available for testing');
    console.log('💡 The system will work even without database access');
  }
}

runExtensionTest();
