import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import multer from 'multer';
import FormData from 'form-data';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Load building data from uw.txt
function loadBuildingData() {
  try {
    const filePath = path.join(__dirname, 'uw.txt');
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const lines = fileContent.split('\n').filter(line => line.trim() && !line.startsWith('Name'));
    
    return lines.map(line => {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 3) {
        const latitude = parseFloat(parts[parts.length - 2]);
        const longitude = parseFloat(parts[parts.length - 1]);
        const name = parts.slice(0, parts.length - 2).join(' ');
        
        return {
          name: name,
          latitude: latitude,
          longitude: longitude
        };
      }
      return null;
    }).filter(Boolean);
  } catch (error) {
    console.error('Error loading building data:', error);
    return [];
  }
}

const buildings = loadBuildingData();

const app = express();
const PORT = 3002;

app.use(cors());
app.use(express.json());

// Configure multer for file uploads
const upload = multer({ storage: multer.memoryStorage() });

// Use environment variables
const API_KEY = process.env.REACT_APP_ELEVENLABS_API_KEY;
const VOICE_ID = '7p1Ofvcwsv7UBPoFNcpI';
const ELEVENLABS_STT_URL = process.env.ELEVENLABS_STT_URL;

app.post('/speak', async (req, res) => {
  const { text } = req.body;

  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': API_KEY,
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: 1.0,
          similarity_boost: 0.8
        }
      })
    });

    res.set('Content-Type', 'audio/mpeg');
    response.body.pipe(res);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).send('Something went wrong.');
  }
});

// ElevenLabs Speech-to-Text endpoint
app.post('/api/elevenlab-stt', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    const formData = new FormData();
    formData.append('file', req.file.buffer, {
      filename: 'recording.webm',
      contentType: req.file.mimetype
    });
    formData.append('model_id', 'scribe_v1');

    const response = await fetch(ELEVENLABS_STT_URL, {
      method: 'POST',
      headers: {
        'xi-api-key': API_KEY,
        ...formData.getHeaders()
      },
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ 
        error: `ElevenLabs API error: ${response.status}`,
        details: errorText
      });
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('STT Error:', err);
    res.status(500).json({ error: 'Speech-to-text conversion failed' });
  }
});

// Gemini parsing endpoint
app.post('/api/parse-with-gemini', async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'No text provided' });
    }

    console.log('Processing text with Gemini:', text);

    // Prepare the building list for Gemini
    const buildingList = buildings.map(b => `${b.name} (${b.latitude}, ${b.longitude})`).join('\n');

    // Create prompt for Gemini
    const prompt = `
You are helping to parse location directions for University of Washington campus navigation.

Given this speech text: "${text}"

And this list of available buildings with coordinates:
${buildingList}

Please identify the START and END locations mentioned in the text and try your best to match them to buildings from the list.
Also describe the path between the START and END locations in extreme accurate detail, including what you might find along the way and simple directional instructions.
Return ONLY a JSON object in this exact format:
{
  "pathDescription": "brief description of the path between start and end",
  "start": {
    "name": "full name without the abbreviation",
    "latitude": number,
    "longitude": number
  },
  "end": {
    "name": "full name without the abbreviation", 
    "latitude": number,
    "longitude": number
  }
}

If you cannot find a match for start or end, set that field to null.
Do not include any other text, only the JSON object.
`;

    // Call Gemini API using SDK
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
    
    console.log('Calling Gemini API...');
    
    const result = await model.generateContent(prompt);
    const geminiText = result.response.text();

    if (!geminiText) {
      throw new Error('No response from Gemini API');
    }

    console.log('Gemini response:', geminiText);

    // Parse Gemini's JSON response
    let parsed = { start: null, end: null };
    let matched = null;

    try {
      // Extract JSON from markdown code blocks if present
      let jsonText = geminiText.trim();
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      
      const geminiResult = JSON.parse(jsonText.trim());
      
      if (geminiResult.start || geminiResult.end) {
        matched = {
          start: geminiResult.start,
          end: geminiResult.end
        };
        
        parsed = {
          start: geminiResult.start?.name || null,
          end: geminiResult.end?.name || null
        };
      }
    } catch (parseError) {
      console.error('Error parsing Gemini JSON:', parseError);
      // Fallback to basic parsing if Gemini response isn't valid JSON
      const patterns = [
        /(?:from|start|starting at|beginning at)\s+([^,.\n]+?)(?:\s+to\s+|\s+and\s+|\s+,\s+|\s+ending at\s+|\s+until\s+)([^,.\n]+)/i,
        /(?:go from|navigate from|travel from)\s+([^,.\n]+?)(?:\s+to\s+|\s+and\s+|\s+,\s+)([^,.\n]+)/i,
        /([^,.\n]+?)\s+(?:to|and)\s+([^,.\n]+)/i
      ];
      
      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
          parsed = {
            start: match[1].trim(),
            end: match[2].trim()
          };
          break;
        }
      }
    }

    const response = {
      parsed,
      parsedNames: parsed,
      matched,
      raw: JSON.stringify({ originalText: text, geminiResponse: geminiText })
    };

    // Log the stored location data for debugging
    if (matched) {
      console.log('Stored location data:', {
        from: matched.start ? {
          name: matched.start.name,
          latitude: matched.start.latitude,
          longitude: matched.start.longitude
        } : null,
        to: matched.end ? {
          name: matched.end.name,
          latitude: matched.end.latitude,
          longitude: matched.end.longitude
        } : null
      });
    }

    res.json(response);
  } catch (err) {
    console.error('Gemini parsing error:', err);
    res.status(500).json({ error: 'Location parsing failed', details: err.message });
  }
});

// Add a simple health check endpoint
app.get('/', (req, res) => {
  res.json({ status: 'Server is running', endpoints: ['/speak', '/api/elevenlab-stt', '/api/parse-with-gemini'] });
});

// Add error handling for the server
app.listen(PORT, () => {
  console.log(`🟢 Server running at http://localhost:${PORT}`);
}).on('error', (err) => {
  console.error('Server failed to start:', err);
  process.exit(1);
});
