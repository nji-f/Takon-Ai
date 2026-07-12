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
    model = 'google/gemini-3-flash-preview',
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

  // ── 2. Ambil pesan user asli ──
  let userQuery = '';
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
  if (lastUserMsg && typeof lastUserMsg.content === 'string') {
    userQuery = lastUserMsg.content.trim();
  }

  // ── 3. Cari data dari web ──
  let searchContext = '';
  if (userQuery.length >= 4 && !image) {
    searchContext = await searchWeb(userQuery);
  }

  // ── 4. Bangun ulang messages ──
  let systemPrompt = "Kamu adalah asisten yang ramah dan membantu. ";
  if (realtimeInfo) {
    systemPrompt += realtimeInfo + " ";
  }
  if (searchContext) {
    systemPrompt += "Gunakan [Hasil Pencarian Web] berikut untuk menjawab pertanyaan pengguna secara akurat. ";
  } else {
    systemPrompt += "Jika tidak ada data terbaru, kamu boleh menggunakan pengetahuan internalmu, tapi sebutkan bahwa itu pengetahuan umum (bukan real‑time). ";
  }
  systemPrompt += "Jangan mengarang informasi yang tidak kamu ketahui.";

  let apiMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.filter(m => m.role !== 'system')
  ];

  // Tempel hasil pencarian ke pesan user terakhir
  const lastUserIdx = apiMessages.map(m => m.role).lastIndexOf('user');
  if (lastUserIdx !== -1) {
    let finalContent = userQuery;
    if (searchContext) {
      finalContent += '\n\n[Hasil Pencarian Web]\n' + searchContext +
                     '\n\nJawablah pertanyaan pengguna berdasarkan informasi di atas.';
    }
    apiMessages[lastUserIdx].content = finalContent;
  }

  // ── 5. Tambahkan gambar (jika ada) ──
  if (image && lastUserIdx !== -1) {
    apiMessages[lastUserIdx].content = [
      { type: 'text', text: apiMessages[lastUserIdx].content },
      { type: 'image_url', image_url: { url: image } }
    ];
  }

  // ── 6. Panggil OpenRouter ──
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://takon-ai.vercel.app', // ganti dengan domainmu
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

// ─── Fungsi pencarian web ───
async function searchWeb(query) {
  // 1. Coba DuckDuckGo API (paling stabil)
  try {
    const ddg = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`
    ).then(res => res.json());

    if (ddg.AbstractText) {
      return `${ddg.AbstractText}\nSumber: ${ddg.AbstractURL}`;
    }
    // Gabungkan topik terkait
    const related = ddg.RelatedTopics || [];
    const snippets = related.filter(r => r.Text).slice(0, 3).map(r => r.Text).join('\n');
    if (snippets) return snippets;
  } catch (_) {}

  // 2. Fallback scraping DuckDuckGo HTML
  try {
    const html = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    }).then(res => res.text());

    // Ekstrak cuplikan hasil
    const results = [];
    const blocks = html.split('<div class="result">');
    for (let i = 1; i < blocks.length && results.length < 2; i++) {
      const title = (blocks[i].match(/<a class="result__a"[^>]*>(.*?)<\/a>/i) || ['',''])[1].replace(/<[^>]+>/g, '').trim();
      const snippet = (blocks[i].match(/<a class="result__snippet"[^>]*>(.*?)<\/a>/i) || ['',''])[1].replace(/<[^>]+>/g, '').trim();
      if (title || snippet) results.push(`${title}\n${snippet}`);
    }
    if (results.length > 0) return results.join('\n\n');
  } catch (_) {}

  // 3. Fallback terakhir: scraping Google
  try {
    const html = await fetch(
      `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=id`,
      { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } }
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

  return null; // Semua gagal
}
