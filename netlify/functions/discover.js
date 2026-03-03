const axios = require('axios');
const { parse } = require('csv-parse/sync');

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type'
};

// ── Google Sheets ────────────────────────────────────────────────
async function fetchTasteProfile() {
  const sheetId = process.env.GOOGLE_SHEETS_ID;
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=0`;
  const response = await axios.get(url, { timeout: 12000 });
  return parse(response.data, { columns: true, skip_empty_lines: true, trim: true });
}

// ── Groq ─────────────────────────────────────────────────────────
async function getRecommendation(tasteProfile, suggested, userMessage) {
  const sample = tasteProfile.slice(0, 60);
  const tasteSummary = sample.map(t => {
    const a = t.Artist || t.artist || t.ARTIST || '';
    const s = t.Track || t.track || t.Title || t.title || t.Song || t.song || '';
    const al = t.Album || t.album || '';
    return [a, s, al ? `[${al}]` : ''].filter(Boolean).join(' - ');
  }).filter(Boolean).join('\n');

  const suggestedList = suggested.length > 0
    ? suggested.map(s => `${s.artist} - ${s.album}`).join('\n')
    : 'none yet';

  const systemPrompt = `You are a music discovery expert specializing in rare, obscure, underrated albums.
Recommend ONE album coherent with the user's taste but little-known.

Rules:
- RARE or LITTLE-KNOWN only (no mainstream, no critically overexposed albums)
- Coherent with demonstrated taste
- NEVER repeat albums from the already-suggested list
- No ultra-famous albums (no Beatles, Floyd, Zeppelin, Radiohead, etc.)
- Prefer: private press, regional scenes, cult gems, non-Anglophone artists

Respond with ONLY a raw JSON object (no markdown, no explanation):
{"artist":"...","album":"...","year":"YYYY","genre":"...","why":"...","rarity":"..."}`;

  const userPrompt = `TASTE PROFILE:\n${tasteSummary}\n\nALREADY SUGGESTED:\n${suggestedList}\n\nUSER: ${userMessage || 'give me something rare and amazing'}\n\nJSON:`;

  const resp = await axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      model: 'llama3-70b-8192',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.9,
      max_tokens: 500
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    }
  );

  const text = resp.data.choices[0].message.content;
  const match = text.match(/\{[\s\S]*?\}/);
  if (!match) throw new Error(`Groq returned no JSON: ${text.slice(0, 100)}`);
  return JSON.parse(match[0]);
}

// ── Discogs ──────────────────────────────────────────────────────
async function searchDiscogs(artist, album) {
  try {
    const r = await axios.get('https://api.discogs.com/database/search', {
      params: { artist, release_title: album, type: 'master', per_page: 3 },
      headers: {
        Authorization: `Discogs token=${process.env.DISCOGS_TOKEN}`,
        'User-Agent': 'piupiu/1.0'
      },
      timeout: 10000
    });
    const top = r.data.results?.[0];
    if (!top) return null;
    return {
      year: top.year || '',
      genres: top.genre || [],
      styles: top.style || [],
      cover: top.cover_image || '',
      url: top.uri ? `https://www.discogs.com${top.uri}` : ''
    };
  } catch { return null; }
}

// ── YouTube ──────────────────────────────────────────────────────
async function findYouTubeLink(artist, album) {
  try {
    const r = await axios.get('https://www.googleapis.com/youtube/v3/search', {
      params: {
        part: 'snippet',
        q: `${artist} ${album} full album`,
        type: 'video',
        maxResults: 5,
        key: process.env.YOUTUBE_API_KEY
      },
      timeout: 10000
    });
    const items = r.data.items || [];
    const best = items.find(i =>
      i.snippet.title.toLowerCase().includes('full album') ||
      i.snippet.title.toLowerCase().includes('full lp')
    ) || items[0];
    if (!best) throw new Error('no results');
    return `https://www.youtube.com/watch?v=${best.id.videoId}`;
  } catch {
    return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${artist} ${album} full album`)}`;
  }
}

// ── Handler ──────────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };

  try {
    const body = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf-8')
      : (event.body || '{}');
    const { message, suggested = [] } = JSON.parse(body);

    const tasteProfile = await fetchTasteProfile();
    const albumSuggestion = await getRecommendation(tasteProfile, suggested, message);
    const discogsData = await searchDiscogs(albumSuggestion.artist, albumSuggestion.album);
    const ytLink = await findYouTubeLink(albumSuggestion.artist, albumSuggestion.album);

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({
        ok: true,
        result: {
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
        }
      })
    };
  } catch (e) {
    console.error('[discover]', e.message);
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ ok: false, error: e.message })
    };
  }
};
