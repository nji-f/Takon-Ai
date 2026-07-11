// api/chat.js
// Backend Takon AI — OpenRouter + Gemini 2.0 Flash (vision, gratis)
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
    model = 'google/gemini-2.0-flash',
    max_tokens = 4096,
    temperature = 0.7
  } = req.body;

  // ── 1. Siapkan messages ──
  let apiMessages = [...messages];

  // Jika ada gambar, ubah pesan user terakhir menjadi multimodal
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
    // Jika tidak ditemukan pesan user (seharusnya tidak terjadi), abaikan.
  }

  // ── 2. Panggil OpenRouter ──
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://takon-ai.vercel.app', // ganti dengan domain kamu
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

    // ── 3. Streaming balik ke frontend ──
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
