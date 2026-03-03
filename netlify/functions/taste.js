// Zero external dependencies — uses Node 18 built-in fetch

const CORS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

exports.handler = async () => {
  try {
    const id = process.env.GOOGLE_SHEETS_ID;
    const urls = [
      `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv`,
      `https://docs.google.com/spreadsheets/d/${id}/export?format=csv`,
      `https://docs.google.com/spreadsheets/d/${id}/pub?output=csv`
    ];
    let text = null;
    for (const url of urls) {
      const res = await fetch(url, { redirect: 'follow' });
      if (res.ok) { const t = await res.text(); if (!t.trim().startsWith('<')) { text = t; break; } }
    }
    if (!text) throw new Error('Cannot read Google Sheet');
    const lines = text.split('\n').filter(l => l.trim());
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true, tracks: Math.max(0, lines.length - 1) }) };
  } catch (e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ ok: false, error: e.message }) };
  }
};
