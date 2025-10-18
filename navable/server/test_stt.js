// Simple test script to upload a local audio file to the local STT proxy
// Usage: node test_stt.js path/to/sample.webm

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: node test_stt.js path/to/audio.file');
    process.exit(1);
  }
  const filePath = path.resolve(arg);
  if (!fs.existsSync(filePath)) {
    console.error('File not found:', filePath);
    process.exit(1);
  }

  const form = new FormData();
  form.append('file', fs.createReadStream(filePath));

  try {
    const resp = await axios.post('http://localhost:4000/api/elevenlab-stt', form, {
      headers: { ...form.getHeaders() },
      maxBodyLength: Infinity,
    });
    console.log('Response:', resp.status, resp.data);
  } catch (err) {
    console.error('Error calling /api/elevenlab-stt:');
    if (err.response) {
      console.error('Status:', err.response.status);
      console.error('Body:', err.response.data);
    } else {
      console.error(err.message);
    }
    process.exit(1);
  }
}

main();
