const fs = require('fs');
const path = require('path');

const HISTORY_PATH = path.join(__dirname, '..', 'data', 'suggested.json');

function loadSuggested() {
  try {
    if (!fs.existsSync(HISTORY_PATH)) return [];
    const raw = fs.readFileSync(HISTORY_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

function saveSuggested(entry) {
  const list = loadSuggested();
  list.push({ ...entry, date: new Date().toISOString() });
  fs.mkdirSync(path.dirname(HISTORY_PATH), { recursive: true });
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(list, null, 2));
}

module.exports = { loadSuggested, saveSuggested };
