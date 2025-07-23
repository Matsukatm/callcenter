const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = 5005;

// Enable CORS for frontend access
app.use(cors());

// Directory where Asterisk stores recordings
const BASE_DIR = "/var/spool/asterisk/monitor";

// List recordings with optional phone number filter
app.get("/api/recordings/:year/:month/:day", (req, res) => {
  const { year, month, day } = req.params;
  const { phone } = req.query; // Get phone number from query parameter
  
  // Validate date format
  if (!/^\d{4}$/.test(year) || !/^\d{2}$/.test(month) || !/^\d{2}$/.test(day)) {
    return res.status(400).json({ error: "Invalid date format" });
  }
  
  const dirPath = path.join(BASE_DIR, year, month, day);

  fs.readdir(dirPath, (err, files) => {
    if (err) {
      return res.status(404).json({ error: "Directory not found" });
    }

    let wavFiles = files.filter((file) => 
      file.endsWith(".wav") && !file.includes("..")
    );
    
    // Filter by phone number if provided
    if (phone) {
      const normalizedPhone = normalizePhoneNumber(phone);
      wavFiles = wavFiles.filter(file => 
        file.includes(normalizedPhone) || 
        file.includes(phone) ||
        file.includes(phone.replace(/^\+/, '')) // Remove + prefix
      );
    }
    
    res.json(wavFiles);
  });
});

// Serve a specific recording
app.get("/recordings/:year/:month/:day/:filename", (req, res) => {
  const { year, month, day, filename } = req.params;
  const filePath = path.join(BASE_DIR, year, month, day, filename);

  // Security: Prevent path traversal
  if (!filePath.startsWith(BASE_DIR)) {
    return res.status(403).json({ error: "Access denied" });
  }

  // Check if file exists before sending
  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      return res.status(404).json({ error: "File not found" });
    }
    
    res.sendFile(filePath);
  });
});

app.listen(5005, "0.0.0.0", () => {
  console.log("Recording server running at http://0.0.0.0:5005");
});

// Helper function to normalize phone numbers for search
function normalizePhoneNumber(phone) {
  if (!phone) return '';
  
  // Remove all non-digits
  let cleaned = phone.replace(/\D/g, '');
  
  // Handle Kenyan numbers
  if (cleaned.startsWith('0')) {
    cleaned = '254' + cleaned.substring(1);
  } else if (cleaned.startsWith('7') || cleaned.startsWith('1')) {
    cleaned = '254' + cleaned;
  }
  
  return cleaned;
}
