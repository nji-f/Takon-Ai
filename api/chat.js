// api/chat.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
  if (!OPENROUTER_API_KEY) {
    res.status(500).json({ error: 'Server configuration error: Missing OPENROUTER_API_KEY' });
    return;
  }

  const {
    messages,
    image,
    model = 'google/gemini-3-flash-preview',
    max_tokens = 4096,
    temperature = 0.7
  } = req.body;

  // ── 1. Data waktu & kurs real‑time ──
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

    realtimeInfo = `[Informasi real‑time: Sekarang pukul ${timeStr}.`;
    if (idrRate) realtimeInfo += ` Kurs USD ke IDR: 1 USD = Rp${idrRate.toLocaleString('id-ID')}.`;
    realtimeInfo += ']';
  } catch (e) {
    console.error('Gagal data real‑time:', e);
  }

  // ── 2. Pencarian web otomatis via DuckDuckGo ──
  let searchContext = '';
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
  if (lastUserMsg && typeof lastUserMsg.content === 'string' && !image) {
    const query = lastUserMsg.content.trim();
    if (query.length > 3) { // minimal 4 karakter untuk mencari
      try {
        const ddgRes = await fetch(
          `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`
        );
        if (ddgRes.ok) {
          const data = await ddgRes.json();
          let snippet = '';
          if (data.AbstractText) {
            snippet += `Informasi: ${data.AbstractText}\nSumber: ${data.AbstractURL}\n`;
          }
          if (data.RelatedTopics && data.RelatedTopics.length > 0) {
            snippet += 'Topik terkait:\n';
            data.RelatedTopics.slice(0, 3).forEach(topic => {
              if (topic.Text) snippet += `- ${topic.Text}\n`;
            });
          }
          if (snippet) {
            searchContext = `\n\n[Hasil pencarian web untuk: "${query}"]\n${snippet}`;
          }
        }
      } catch (e) {
        console.error('DDG search error:', e);
      }
    }
  }

  // ── 3. Siapkan messages untuk OpenRouter ──
  let apiMessages = [...messages];

  // Sisipkan info real‑time ke system prompt
  if (realtimeInfo) {
    if (apiMessages.length > 0 && apiMessages[0].role === 'system') {
      apiMessages[0].content += '\n\n' + realtimeInfo;
    } else {
      apiMessages.unshift({ role: 'system', content: realtimeInfo });
    }
  }

  // Tambahkan hasil pencarian ke pesan user terakhir
  if (searchContext && lastUserMsg) {
    lastUserMsg.content += searchContext;
  }

  // ── 4. Jika ada gambar, ubah pesan user terakhir menjadi multimodal ──
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
        'HTTP-Referer': 'https://takon-ai.vercel.app', // sesuaikan domain
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
      const errorText = await response.text();
      res.status(response.status).json({ error: errorText });
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
      const chunk = decoder.decode(value, { stream: true });
      res.write(chunk);
    }
    res.end();
  } catch (error) {
    console.error('OpenRouter stream error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
