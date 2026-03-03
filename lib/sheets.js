const axios = require('axios');
const { parse } = require('csv-parse/sync');
const NodeCache = require('node-cache');

const cache = new NodeCache({ stdTTL: 300 }); // 5 min cache

async function fetchTasteProfile() {
  const cached = cache.get('taste');
  if (cached) return cached;

  const sheetId = process.env.GOOGLE_SHEETS_ID;
  // Export as CSV (public sheet)
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=0`;

  const response = await axios.get(url, { timeout: 10000 });
  const records = parse(response.data, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  });

  cache.set('taste', records);
  return records;
}

module.exports = { fetchTasteProfile };
