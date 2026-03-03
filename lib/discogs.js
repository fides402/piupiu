const axios = require('axios');

const DISCOGS_BASE = 'https://api.discogs.com';

async function searchDiscogs(artist, album) {
  try {
    const response = await axios.get(`${DISCOGS_BASE}/database/search`, {
      params: {
        artist,
        release_title: album,
        type: 'master',
        per_page: 3
      },
      headers: {
        'Authorization': `Discogs token=${process.env.DISCOGS_TOKEN}`,
        'User-Agent': 'piupiu/1.0 +https://github.com/piupiu'
      },
      timeout: 10000
    });

    const results = response.data.results;
    if (!results || results.length === 0) {
      // Try release instead of master
      return await searchDiscogsRelease(artist, album);
    }

    const top = results[0];
    return {
      year: top.year || '',
      genres: top.genre || [],
      styles: top.style || [],
      cover: top.cover_image || '',
      url: top.uri ? `https://www.discogs.com${top.uri}` : ''
    };
  } catch (e) {
    console.warn('Discogs search failed:', e.message);
    return null;
  }
}

async function searchDiscogsRelease(artist, album) {
  try {
    const response = await axios.get(`${DISCOGS_BASE}/database/search`, {
      params: {
        artist,
        release_title: album,
        type: 'release',
        per_page: 3
      },
      headers: {
        'Authorization': `Discogs token=${process.env.DISCOGS_TOKEN}`,
        'User-Agent': 'piupiu/1.0 +https://github.com/piupiu'
      },
      timeout: 10000
    });

    const results = response.data.results;
    if (!results || results.length === 0) return null;

    const top = results[0];
    return {
      year: top.year || '',
      genres: top.genre || [],
      styles: top.style || [],
      cover: top.cover_image || '',
      url: top.uri ? `https://www.discogs.com${top.uri}` : ''
    };
  } catch (e) {
    return null;
  }
}

module.exports = { searchDiscogs };
