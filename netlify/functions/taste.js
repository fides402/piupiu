const axios = require('axios');
const { parse } = require('csv-parse/sync');

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*'
};

exports.handler = async () => {
  try {
    const sheetId = process.env.GOOGLE_SHEETS_ID;
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=0`;
    const response = await axios.get(url, { timeout: 12000 });
    const records = parse(response.data, { columns: true, skip_empty_lines: true, trim: true });
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true, tracks: records.length }) };
  } catch (e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ ok: false, error: e.message }) };
  }
};
