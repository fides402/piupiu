// Zero external dependencies — uses Node 18 built-in fetch

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type'
};

// ── CSV parser (no csv-parse library needed) ─────────────────────
function parseCSV(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = splitLine(lines[0]);
  return lines.slice(1).map(line => {
    const vals = splitLine(line);
    return Object.fromEntries(headers.map((h, i) => [h.trim(), (vals[i] || '').trim()]));
  });
}

function splitLine(line) {
  const out = [];
  let cur = '', inQ = false;
  for (const c of line) {
    if (c === '"') { inQ = !inQ; }
    else if (c === ',' && !inQ) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

// ── Google Sheets ────────────────────────────────────────────────
async function fetchTasteProfile() {
  const id = process.env.GOOGLE_SHEETS_ID;
  // gviz endpoint works for any "Anyone with link can view" sheet, no gid needed
  const urls = [
    `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv`,
    `https://docs.google.com/spreadsheets/d/${id}/export?format=csv`,
    `https://docs.google.com/spreadsheets/d/${id}/pub?output=csv`
  ];
  for (const url of urls) {
    const res = await fetch(url, { redirect: 'follow' });
    if (res.ok) {
      const text = await res.text();
      if (text.trim().startsWith('<')) continue; // got HTML login page, try next
      return parseCSV(text);
    }
  }
  throw new Error('Cannot read Google Sheet. Make sure it is shared as "Anyone with the link can view".');
}

// ── Groq ─────────────────────────────────────────────────────────
async function getRecommendation(tracks, suggested, userMessage) {
  const tasteSummary = tracks.slice(0, 60).map(t => {
    const a = t.Artist || t.artist || t.ARTIST || '';
    const s = t.Track || t.track || t.Title || t.title || t.Song || t.song || '';
    const al = t.Album || t.album || '';
    return [a, s, al ? `[${al}]` : ''].filter(Boolean).join(' - ');
  }).filter(Boolean).join('\n');

  const already = suggested.length
    ? suggested.map(s => `${s.artist} - ${s.album}`).join('\n')
    : 'none';

  const system = `You are a music expert specializing in rare and obscure albums.
Recommend ONE rare/little-known album matching the user's taste.
NEVER suggest mainstream or famous albums.
NEVER repeat albums from the already-suggested list.
Reply ONLY with a raw JSON object, no markdown:
{"artist":"...","album":"...","year":"YYYY","genre":"...","why":"2-3 sentences","rarity":"1 sentence"}`;

  const user = `TASTE:\n${tasteSummary}\n\nALREADY SUGGESTED:\n${already}\n\nUSER: ${userMessage || 'something rare and amazing'}\n\nJSON:`;

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'llama3-70b-8192',
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      temperature: 0.9,
      max_tokens: 400
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq ${res.status}: ${err.slice(0, 300)}`);
  }

  const text = (await res.json()).choices[0].message.content;
  const m = text.match(/\{[\s\S]*?\}/);
  if (!m) throw new Error(`No JSON from Groq: ${text.slice(0, 150)}`);
  return JSON.parse(m[0]);
}

// ── Discogs ──────────────────────────────────────────────────────
async function searchDiscogs(artist, album) {
  try {
    const params = new URLSearchParams({ artist, release_title: album, type: 'master', per_page: '3' });
    const res = await fetch(`https://api.discogs.com/database/search?${params}`, {
      headers: {
        Authorization: `Discogs token=${process.env.DISCOGS_TOKEN}`,
        'User-Agent': 'piupiu/1.0'
      }
    });
    if (!res.ok) return null;
    const top = (await res.json()).results?.[0];
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
    const params = new URLSearchParams({
      part: 'snippet', q: `${artist} ${album} full album`,
      type: 'video', maxResults: '5', key: process.env.YOUTUBE_API_KEY
    });
    const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
    if (!res.ok) throw new Error('yt fail');
    const items = (await res.json()).items || [];
    const best = items.find(i => /full (album|lp)/i.test(i.snippet.title)) || items[0];
    if (!best) throw new Error('no results');
    return `https://www.youtube.com/watch?v=${best.id.videoId}`;
  } catch {
    return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${artist} ${album} full album`)}`;
  }
}

// ── Handler ──────────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: '{}' };

  try {
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString()
      : (event.body || '{}');
    const { message, suggested = [] } = JSON.parse(raw);

    const tracks = await fetchTasteProfile();
    const pick = await getRecommendation(tracks, suggested, message);
    const discogs = await searchDiscogs(pick.artist, pick.album);
    const yt = await findYouTubeLink(pick.artist, pick.album);

    return {
      statusCode: 200, headers: CORS,
      body: JSON.stringify({
        ok: true,
        result: {
          artist: pick.artist, album: pick.album,
          year: discogs?.year || pick.year || '',
          genre: discogs?.genres?.join(', ') || pick.genre || '',
          style: discogs?.styles?.join(', ') || '',
          why: pick.why, rarity: pick.rarity,
          coverUrl: discogs?.cover || '',
          youtubeUrl: yt,
          discogsUrl: discogs?.url || ''
        }
      })
    };
  } catch (e) {
    console.error('[discover]', e.message);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ ok: false, error: e.message }) };
  }
};
