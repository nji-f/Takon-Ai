// api/chat.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
  if (!OPENROUTER_API_KEY) {
    res.status(500).json({ error: 'Missing OPENROUTER_API_KEY' });
    return;
  }

  const {
    messages,
    image,
    model = 'google/gemini-3-flash-preview', // default sesuai permintaan
    max_tokens = 4096,
    temperature = 0.7
  } = req.body;

  // ── 1. Info waktu & kurs (real‑time) ──
  let realtimeInfo = '';
  try {
    const now = new Date();
    const wibTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
    const timeStr = wibTime.toLocaleString('id-ID', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }) + ' WIB';

    const forexRes = await fetch('https://open.er-api.com/v6/latest/USD');
    let idrRate = null;
    if (forexRes.ok) {
      const data = await forexRes.json();
      idrRate = data?.rates?.IDR;
    }

    realtimeInfo = `[Info real‑time: Sekarang ${timeStr}.`;
    if (idrRate) realtimeInfo += ` 1 USD = Rp${idrRate.toLocaleString('id-ID')}.`;
    realtimeInfo += ']';
  } catch (_) {}

  // ── 2. Search web otomatis ──
  let searchContext = '';
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');

  if (lastUserMsg && typeof lastUserMsg.content === 'string' && !image) {
    const query = lastUserMsg.content.trim();
    if (query.length >= 4) {
      searchContext = await searchWeb(query);
    }
  }

  // ── 3. Susun ulang messages ──
  const SYSTEM_INSTRUCTION =
    "Kamu adalah asisten yang hanya menjawab berdasarkan data yang diberikan. " +
    "Jika ada [Hasil Pencarian Web] di bawah, gunakan informasi tersebut. " +
    "Jangan mengarang. Jika tidak ada data, cukup katakan tidak tahu.";

  let apiMessages = [
    { role: 'system', content: SYSTEM_INSTRUCTION + '\n\n' + realtimeInfo },
    ...messages.filter(m => m.role !== 'system') // hapus system prompt bawaan
  ];

  // Tempel hasil pencarian ke pesan user terakhir
  if (searchContext && lastUserMsg) {
    const apiLastUser = [...apiMessages].reverse().find(m => m.role === 'user');
    if (apiLastUser) {
      apiLastUser.content += '\n\n[Hasil Pencarian Web]\n' + searchContext +
        '\n\nJawablah pertanyaan pengguna berdasarkan informasi di atas.';
    }
  }

  // ── 4. Gambar (multimodal) ──
  if (image) {
    const lastUserIdx = apiMessages.map(m => m.role).lastIndexOf('user');
    if (lastUserIdx !== -1) {
      apiMessages[lastUserIdx].content = [
        { type: 'text', text: apiMessages[lastUserIdx].content },
        { type: 'image_url', image_url: { url: image } }
      ];
    }
  }

  // ── 5. Panggil OpenRouter ──
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://takon-ai.vercel.app', // ganti ke domain lo
        'X-Title': 'Takon AI'
      },
      body: JSON.stringify({
        model,
        messages: apiMessages,
        stream: true,
        max_tokens,
        temperature
      })
    });

    if (!response.ok) {
      const err = await response.text();
      res.status(response.status).json({ error: err });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value, { stream: true }));
    }
    res.end();
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

// ─── Fungsi Search Web (Google → fallback DuckDuckGo) ───
async function searchWeb(query) {
  // 1. Coba scraping Google (gratis, tanpa API key)
  try {
    const html = await fetch(
      `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=id`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      }
    ).then(res => res.text());

    const blocks = html.split('<div class="g">');
    const snippets = [];
    for (let i = 1; i < blocks.length && snippets.length < 2; i++) {
      const title = (blocks[i].match(/<h3[^>]*>(.*?)<\/h3>/i) || ['',''])[1].replace(/<[^>]+>/g, '').trim();
      const snippet = (blocks[i].match(/<span class="aCOpRe"[^>]*>(.*?)<\/span>/i) || ['',''])[1].replace(/<[^>]+>/g, '').trim();
      if (title || snippet) snippets.push(`${title}\n${snippet}`);
    }
    if (snippets.length > 0) return snippets.join('\n\n');
  } catch (_) {}

  // 2. Fallback DuckDuckGo API (gratis, tanpa batas)
  try {
    const ddg = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`
    ).then(res => res.json());

    if (ddg.AbstractText) {
      return `${ddg.AbstractText}\nSumber: ${ddg.AbstractURL}`;
    }
    const related = ddg.RelatedTopics || [];
    const items = related.filter(r => r.Text).slice(0, 2).map(r => r.Text).join('\n');
    if (items) return items;
  } catch (_) {}

  return null;
}
