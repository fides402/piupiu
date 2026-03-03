const axios = require('axios');

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

function buildTasteSummary(tracks) {
  // Take up to 80 tracks to avoid token overflow
  const sample = tracks.slice(0, 80);
  return sample.map(t => {
    const parts = [];
    if (t.Artist || t.artist) parts.push(t.Artist || t.artist);
    if (t.Track || t.track || t.Title || t.title) parts.push(t.Track || t.track || t.Title || t.title);
    if (t.Album || t.album) parts.push(`[${t.Album || t.album}]`);
    return parts.join(' - ');
  }).join('\n');
}

async function getRecommendation(tasteProfile, suggested, userMessage) {
  const tasteSummary = buildTasteSummary(tasteProfile);
  const suggestedList = suggested.length > 0
    ? suggested.map(s => `${s.artist} - ${s.album}`).join('\n')
    : 'none yet';

  const systemPrompt = `You are a music discovery expert with encyclopedic knowledge of obscure, rare, and underrated albums across all genres.
Your task: recommend ONE single rare/obscure album that matches a user's taste profile.

Rules:
- The album must be RARE or LITTLE-KNOWN (not mainstream, not critically overexposed)
- Must be genuinely coherent with the user's demonstrated taste
- NEVER suggest albums already in the suggested list
- NEVER suggest extremely famous albums (no Beatles, no Pink Floyd classics, no Radiohead, etc.)
- Prefer: private press, regional scenes, cult followings, overlooked gems, non-Anglophone artists
- Return ONLY valid JSON, no markdown, no extra text

JSON format:
{
  "artist": "Artist Name",
  "album": "Album Title",
  "year": "YYYY",
  "genre": "Genre",
  "why": "2-3 sentences explaining why this matches the user's taste and what makes it special",
  "rarity": "Brief note on why this is obscure/rare"
}`;

  const userPrompt = `USER'S TASTE (songs they love):
${tasteSummary}

ALREADY SUGGESTED (never repeat these):
${suggestedList}

USER MESSAGE: ${userMessage || 'Suggest me something rare and amazing'}

Recommend ONE rare album:`;

  const response = await axios.post(
    GROQ_API_URL,
    {
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.9,
      max_tokens: 600,
      response_format: { type: 'json_object' }
    },
    {
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    }
  );

  const content = response.data.choices[0].message.content;
  return JSON.parse(content);
}

module.exports = { getRecommendation };
