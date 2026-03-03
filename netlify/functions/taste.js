// Zero external dependencies — uses Node 18 built-in fetch

const CORS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

exports.handler = async () => {
  try {
    const url = `https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_SHEETS_ID}/export?format=csv&gid=0`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Sheets ${res.status}`);
    const lines = (await res.text()).split('\n').filter(l => l.trim());
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true, tracks: Math.max(0, lines.length - 1) }) };
  } catch (e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ ok: false, error: e.message }) };
  }
};
