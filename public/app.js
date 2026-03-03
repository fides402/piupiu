const input = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
const resultArea = document.getElementById('resultArea');
const loading = document.getElementById('loading');
const errorBox = document.getElementById('errorBox');
const historySection = document.getElementById('historySection');
const historyToggle = document.getElementById('historyToggle');
const historyList = document.getElementById('historyList');
const clearBtn = document.getElementById('clearBtn');

// Auto-resize textarea
input.addEventListener('input', () => {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 120) + 'px';
});

// Send on Enter (Shift+Enter = newline)
input.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    discover();
  }
});

sendBtn.addEventListener('click', discover);

historyToggle.addEventListener('click', async () => {
  if (historySection.style.display === 'none') {
    await loadHistory();
    historySection.style.display = 'block';
    historyToggle.textContent = '✕ chiudi';
  } else {
    historySection.style.display = 'none';
    historyToggle.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> cronologia`;
  }
});

clearBtn.addEventListener('click', async () => {
  await fetch('/api/history', { method: 'DELETE' });
  historyList.innerHTML = '<div style="color:#444;font-size:12px;padding:8px 0;">nessun disco suggerito ancora</div>';
});

async function discover() {
  const message = input.value.trim();
  setLoading(true);
  hideAll();

  try {
    const res = await fetch('/api/discover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });

    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Errore sconosciuto');

    renderResult(data.result);
    input.value = '';
    input.style.height = 'auto';
  } catch (e) {
    showError(e.message);
  } finally {
    setLoading(false);
  }
}

function renderResult(r) {
  // Meta badges
  const badges = document.getElementById('metaBadges');
  badges.innerHTML = '';
  if (r.year) badges.innerHTML += `<span class="badge badge-year">${r.year}</span>`;
  if (r.genre) r.genre.split(',').slice(0, 2).forEach(g => {
    badges.innerHTML += `<span class="badge badge-genre">${g.trim()}</span>`;
  });
  if (r.style) r.style.split(',').slice(0, 2).forEach(s => {
    badges.innerHTML += `<span class="badge badge-genre">${s.trim()}</span>`;
  });

  document.getElementById('albumTitle').textContent = r.album;
  document.getElementById('artistName').textContent = r.artist;
  document.getElementById('whyText').textContent = r.why;
  document.getElementById('rarityText').textContent = r.rarity;

  // Cover
  const coverImg = document.getElementById('coverImg');
  const coverPlaceholder = document.getElementById('coverPlaceholder');
  if (r.coverUrl) {
    coverImg.src = r.coverUrl;
    coverImg.onload = () => {
      coverImg.classList.add('loaded');
      coverPlaceholder.style.display = 'none';
    };
    coverImg.onerror = () => {
      coverImg.classList.remove('loaded');
      coverPlaceholder.style.display = 'flex';
    };
  } else {
    coverImg.classList.remove('loaded');
    coverPlaceholder.style.display = 'flex';
  }

  // YouTube
  const ytLink = document.getElementById('ytLink');
  if (r.youtubeUrl) {
    ytLink.href = r.youtubeUrl;
    ytLink.style.display = 'flex';
  } else {
    ytLink.style.display = 'none';
  }

  // Discogs
  const discogsLink = document.getElementById('discogsLink');
  if (r.discogsUrl) {
    discogsLink.href = r.discogsUrl;
    discogsLink.style.display = 'block';
  } else {
    discogsLink.style.display = 'none';
  }

  resultArea.style.display = 'block';
}

async function loadHistory() {
  try {
    const res = await fetch('/api/history');
    const data = await res.json();
    const items = data.history || [];
    if (items.length === 0) {
      historyList.innerHTML = '<div style="color:#444;font-size:12px;padding:8px 0;">nessun disco suggerito ancora</div>';
      return;
    }
    historyList.innerHTML = items.slice().reverse().map(item => `
      <div class="history-item">
        <span>${item.artist} — <em>${item.album}</em></span>
        <span style="color:#333">${formatDate(item.date)}</span>
      </div>
    `).join('');
  } catch (e) {
    historyList.innerHTML = '<div style="color:#444;font-size:12px;">errore nel caricare la cronologia</div>';
  }
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });
}

function setLoading(show) {
  loading.style.display = show ? 'flex' : 'none';
  sendBtn.disabled = show;
}

function hideAll() {
  resultArea.style.display = 'none';
  errorBox.style.display = 'none';
}

function showError(msg) {
  document.getElementById('errorText').textContent = msg;
  errorBox.style.display = 'flex';
}
