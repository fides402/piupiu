require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { fetchTasteProfile } = require('./lib/sheets');
const { getRecommendation } = require('./lib/groq');
const { searchDiscogs } = require('./lib/discogs');
const { findYouTubeLink } = require('./lib/youtube');
const { loadSuggested, saveSuggested } = require('./lib/history');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/taste', async (req, res) => {
  try {
    const profile = await fetchTasteProfile();
    res.json({ ok: true, tracks: profile.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/discover', async (req, res) => {
  try {
    const { message } = req.body;
    const tasteProfile = await fetchTasteProfile();
    const suggested = loadSuggested();

    // Ask Groq to pick a rare album coherent with taste
    const albumSuggestion = await getRecommendation(tasteProfile, suggested, message);

    // Enrich with Discogs metadata
    const discogsData = await searchDiscogs(albumSuggestion.artist, albumSuggestion.album);

    // Find YouTube link
    const ytLink = await findYouTubeLink(albumSuggestion.artist, albumSuggestion.album);

    const result = {
      artist: albumSuggestion.artist,
      album: albumSuggestion.album,
      year: discogsData?.year || albumSuggestion.year || '',
      genre: discogsData?.genres?.join(', ') || albumSuggestion.genre || '',
      style: discogsData?.styles?.join(', ') || '',
      why: albumSuggestion.why,
      rarity: albumSuggestion.rarity,
      coverUrl: discogsData?.cover || '',
      youtubeUrl: ytLink,
      discogsUrl: discogsData?.url || ''
    };

    // Save to history to avoid re-suggesting
    saveSuggested({ artist: result.artist, album: result.album });

    res.json({ ok: true, result });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/history', (req, res) => {
  res.json({ ok: true, history: loadSuggested() });
});

app.delete('/api/history', (req, res) => {
  const fs = require('fs');
  const historyPath = path.join(__dirname, 'data', 'suggested.json');
  try { fs.writeFileSync(historyPath, '[]'); } catch (e) {}
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`piupiu running on http://localhost:${PORT}`));
