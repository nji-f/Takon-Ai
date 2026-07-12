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
    model = 'google/gemini-3-flash',
    max_tokens = 4096,
    temperature = 0.7
  } = req.body;

  // ── 1. Data waktu & kurs (real‑time) ──
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

    realtimeInfo = `[Info: Sekarang ${timeStr}.`;
    if (idrRate) realtimeInfo += ` 1 USD = Rp${idrRate.toLocaleString('id-ID')}.`;
    realtimeInfo += ']';
  } catch (_) {}

  // ── 2. Scraping Google Search otomatis ──
  let searchContext = '';
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');

  if (lastUserMsg && typeof lastUserMsg.content === 'string' && !image) {
    const query = lastUserMsg.content.trim();
    if (query.length >= 4) {
      searchContext = await fetchGoogleResults(query);
    }
  }

  // ── 3. Susun pesan ke AI ──
  let apiMessages = [...messages];

  // Masukkan info waktu/kurs ke system prompt
  if (realtimeInfo) {
    if (apiMessages.length > 0 && apiMessages[0].role === 'system') {
      apiMessages[0].content += '\n\n' + realtimeInfo;
    } else {
      apiMessages.unshift({ role: 'system', content: realtimeInfo });
    }
  }

  // Tempel hasil pencarian ke pesan user terakhir
  if (searchContext && lastUserMsg) {
    lastUserMsg.content += '\n\n[Hasil pencarian Google]\n' + searchContext;
  }

  // ── 4. Gambar (multimodal) ──
  if (image) {
    let lastUserIdx = -1;
    for (let i = apiMessages.length - 1; i >= 0; i--) {
      if (apiMessages[i].role === 'user') {
        lastUserIdx = i;
        break;
      }
    }
    if (lastUserIdx !== -1) {
      const originalText = apiMessages[lastUserIdx].content;
      apiMessages[lastUserIdx].content = [
        { type: 'text', text: originalText },
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
        'HTTP-Referer': 'https://takon-ai.vercel.app',
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

// ─── Fungsi Scraping Google (tanpa library) ───
async function fetchGoogleResults(query) {
  try {
    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=id`;
    const html = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    }).then(res => res.text());

    // Ambil blok hasil pencarian (setiap result biasanya diawali <div class="g">)
    const results = [];
    const blocks = html.split('<div class="g">');
    for (let i = 1; i < blocks.length && results.length < 3; i++) {
      const block = blocks[i];

      // Cari judul (biasanya di dalam <h3>)
      const titleMatch = block.match(/<h3[^>]*>(.*?)<\/h3>/i);
      const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';

      // Cari cuplikan (snippet) – ambil teks setelah judul sampai link berikutnya
      const snippetMatch = block.match(/<div class="VwiC3b[^"]*"[^>]*>(.*?)<\/div>/i) ||
                          block.match(/<span class="aCOpRe"[^>]*>(.*?)<\/span>/i);
      const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, '').trim() : '';

      if (title || snippet) {
        results.push(`${title}\n${snippet}`);
      }
    }

    if (results.length > 0) {
      return results.join('\n\n');
    }
    // Fallback: jika tidak dapat apa‑apa, coba ambil meta description
    const metaMatch = html.match(/<meta name="description" content="([^"]+)"/i);
    if (metaMatch) {
      return `Deskripsi: ${metaMatch[1]}`;
    }
    return null;
  } catch (e) {
    console.error('Scraping error:', e);
    return null;
  }
}
