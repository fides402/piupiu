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
  const urls = [
    `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv`,
    `https://docs.google.com/spreadsheets/d/${id}/export?format=csv`,
    `https://docs.google.com/spreadsheets/d/${id}/pub?output=csv`
  ];
  for (const url of urls) {
    const res = await fetch(url, { redirect: 'follow' });
    if (res.ok) {
      const text = await res.text();
      if (text.trim().startsWith('<')) continue;
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

  const system = `You are an expert in extremely rare, obscure, and beautiful records.
Your sole mission: recommend ONE album that is:
- ULTRA-RARE: private press, self-released, white label, vanity press, regional/local scene, or limited to under 500 copies
- MUSICALLY EXCEPTIONAL: a hidden masterpiece, not just obscure for obscurity's sake
- COHERENT with the user's taste but unexpected and surprising
- NOT in the already-suggested list
- NEVER mainstream (no Beatles, Rolling Stones, Pink Floyd, Radiohead, Nirvana, etc.)
- NEVER critically overexposed (no Pitchfork darlings, no RYM top 500)

Prefer:
- Library music, private press folk, regional prog/psych, forgotten soul/funk 45s, obscure jazz from non-US countries, avant-garde/experimental from Eastern Europe or South America, minimal synth/wave from the early 80s
- Albums with almost no online presence, discovered only through deep crate digging
- Non-Anglophone artists strongly preferred

Reply ONLY with a raw JSON object, no markdown:
{"artist":"...","album":"...","year":"YYYY","genre":"...","why":"2-3 sentences about why it matches the taste and why it's a masterpiece","rarity":"1 sentence on extreme rarity and how to find it"}`;

  const user = `TASTE:\n${tasteSummary}\n\nALREADY SUGGESTED (NEVER repeat):\n${already}\n\nUSER: ${userMessage || 'qualcosa di rarissimo e bellissimo'}\n\nJSON:`;

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      temperature: 0.95,
      max_tokens: 500
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

// ── Discogs search ────────────────────────────────────────────────
async function searchDiscogs(artist, album) {
  const headers = {
    Authorization: `Discogs token=${process.env.DISCOGS_TOKEN}`,
    'User-Agent': 'piupiu/1.0'
  };

  // Try master first
  for (const type of ['master', 'release']) {
    try {
      const params = new URLSearchParams({ artist, release_title: album, type, per_page: '3' });
      const res = await fetch(`https://api.discogs.com/database/search?${params}`, { headers });
      if (!res.ok) continue;
      const top = (await res.json()).results?.[0];
      if (!top) continue;
      return {
        id: top.id,
        type,
        year: top.year || '',
        genres: top.genre || [],
        styles: top.style || [],
        cover: top.cover_image || '',
        url: top.uri ? `https://www.discogs.com${top.uri}` : ''
      };
    } catch { continue; }
  }
  return null;
}

// ── Discogs videos (from master or release detail) ────────────────
async function getDiscogsVideos(discogsId, type) {
  try {
    const endpoint = type === 'master'
      ? `https://api.discogs.com/masters/${discogsId}`
      : `https://api.discogs.com/releases/${discogsId}`;
    const res = await fetch(endpoint, {
      headers: {
        Authorization: `Discogs token=${process.env.DISCOGS_TOKEN}`,
        'User-Agent': 'piupiu/1.0'
      }
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.videos || [])
      .map(v => {
        const m = v.uri.match(/(?:v=|youtu\.be\/)([\w-]{11})/);
        return m ? m[1] : null;
      })
      .filter(Boolean);
  } catch { return []; }
}

// ── YouTube fallback ──────────────────────────────────────────────
async function findYouTubeFallback(artist, album) {
  try {
    // Search for a playlist first
    const pParams = new URLSearchParams({
      part: 'snippet', q: `${artist} ${album}`,
      type: 'playlist', maxResults: '3', key: process.env.YOUTUBE_API_KEY
    });
    const pRes = await fetch(`https://www.googleapis.com/youtube/v3/search?${pParams}`);
    if (pRes.ok) {
      const items = (await pRes.json()).items || [];
      if (items.length > 0) {
        return `https://www.youtube.com/playlist?list=${items[0].id.playlistId}`;
      }
    }
  } catch {}

  try {
    // Fall back to full album video
    const vParams = new URLSearchParams({
      part: 'snippet', q: `${artist} ${album} full album`,
      type: 'video', maxResults: '5', key: process.env.YOUTUBE_API_KEY
    });
    const vRes = await fetch(`https://www.googleapis.com/youtube/v3/search?${vParams}`);
    if (vRes.ok) {
      const items = (await vRes.json()).items || [];
      const best = items.find(i => /full (album|lp)/i.test(i.snippet.title)) || items[0];
      if (best) return `https://www.youtube.com/watch?v=${best.id.videoId}`;
    }
  } catch {}

  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${artist} ${album} full album`)}`;
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

    // Try up to 4 times to find an album with Discogs videos
    const triedAlbums = [...suggested];
    let pick, discogs, videoIds, youtubeUrl;

    for (let attempt = 0; attempt < 4; attempt++) {
      pick = await getRecommendation(tracks, triedAlbums, message);
      discogs = await searchDiscogs(pick.artist, pick.album);

      if (discogs?.id) {
        videoIds = await getDiscogsVideos(discogs.id, discogs.type);
        if (videoIds.length > 0) {
          // Build YouTube playlist from Discogs video IDs
          youtubeUrl = `https://www.youtube.com/watch_videos?video_ids=${videoIds.join(',')}`;
          break;
        }
      }

      // No Discogs videos — add to tried list and retry
      console.log(`[discover] attempt ${attempt + 1}: ${pick.artist} - ${pick.album} has no Discogs videos, retrying`);
      triedAlbums.push({ artist: pick.artist, album: pick.album });
      pick = null;
    }

    // If all attempts failed to find Discogs videos, use the last pick with fallback
    if (!pick) {
      pick = await getRecommendation(tracks, suggested, message);
      discogs = await searchDiscogs(pick.artist, pick.album);
      youtubeUrl = await findYouTubeFallback(pick.artist, pick.album);
    }

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
          youtubeUrl,
          discogsUrl: discogs?.url || ''
        }
      })
    };
  } catch (e) {
    console.error('[discover]', e.message);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ ok: false, error: e.message }) };
  }
};
