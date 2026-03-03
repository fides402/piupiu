const { fetchTasteProfile } = require('../../lib/sheets');

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*'
};

exports.handler = async () => {
  try {
    const profile = await fetchTasteProfile();
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, tracks: profile.length }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: e.message }) };
  }
};
