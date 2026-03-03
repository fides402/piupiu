const { getRecommendation } = require('../../lib/groq');
const { searchDiscogs } = require('../../lib/discogs');
const { findYouTubeLink } = require('../../lib/youtube');
const { fetchTasteProfile } = require('../../lib/sheets');

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };
  }

  try {
    const { message, suggested = [] } = JSON.parse(event.body || '{}');

    const tasteProfile = await fetchTasteProfile();
    const albumSuggestion = await getRecommendation(tasteProfile, suggested, message);
    const discogsData = await searchDiscogs(albumSuggestion.artist, albumSuggestion.album);
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

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, result }) };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: e.message }) };
  }
};
