import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

const API_KEY = 'sk_49bd8f370b57a68e97eca113945a2486e16cb7776626705f'; // Replace this
const VOICE_ID = '7p1Ofvcwsv7UBPoFNcpI'; // Replace this from https://api.elevenlabs.io/v1/voices

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

app.listen(PORT, () => console.log(`🟢 Server running at http://localhost:${PORT}`));
