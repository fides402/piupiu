const axios = require('axios');

const YT_SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search';

async function findYouTubeLink(artist, album) {
  try {
    const query = `${artist} ${album} full album`;
    const response = await axios.get(YT_SEARCH_URL, {
      params: {
        part: 'snippet',
        q: query,
        type: 'video',
        maxResults: 5,
        key: process.env.YOUTUBE_API_KEY
      },
      timeout: 10000
    });

    const items = response.data.items;
    if (!items || items.length === 0) return null;

    // Prefer "full album" results
    const fullAlbum = items.find(i =>
      i.snippet.title.toLowerCase().includes('full album') ||
      i.snippet.title.toLowerCase().includes('full lp')
    );

    const chosen = fullAlbum || items[0];
    const videoId = chosen.id.videoId;
    return `https://www.youtube.com/watch?v=${videoId}`;
  } catch (e) {
    console.warn('YouTube search failed:', e.message);
    // Fallback: construct a search URL
    const q = encodeURIComponent(`${artist} ${album} full album`);
    return `https://www.youtube.com/results?search_query=${q}`;
  }
}

module.exports = { findYouTubeLink };
