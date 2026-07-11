// api/chat.js
// Backend untuk Takon AI — menggunakan Groq API (LLaMA 3.2 Vision)
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) {
    res.status(500).json({ error: 'Server configuration error: Missing GROQ_API_KEY' });
    return;
  }

  const { messages, image, model = 'llama-3.2-11b-vision-preview' } = req.body;

  // ── 1. Siapkan messages untuk Groq ──
  let apiMessages = [...messages];

  // Jika ada gambar, ubah pesan user terakhir menjadi multimodal
  if (image) {
    // Cari indeks pesan user terakhir
    let lastUserIdx = -1;
    for (let i = apiMessages.length - 1; i >= 0; i--) {
      if (apiMessages[i].role === 'user') {
        lastUserIdx = i;
        break;
      }
    }

    if (lastUserIdx !== -1) {
      const originalText = apiMessages[lastUserIdx].content;
      // Format multimodal: array dengan teks dan gambar
      apiMessages[lastUserIdx].content = [
        { type: 'text', text: originalText },
        {
          type: 'image_url',
          image_url: {
            url: image  // sudah berupa data URL (data:image/...;base64,...)
          }
        }
      ];
    }
    // Jika tidak ditemukan pesan user (seharusnya tidak terjadi), biarkan saja.
  }

  // ── 2. Kirim ke Groq API ──
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: apiMessages,
        stream: true,
        max_tokens: 4096,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      res.status(response.status).json({ error: errorText });
      return;
    }

    // ── 3. Streaming respons balik ke frontend ──
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Groq mengembalikan data dengan format OpenAI SSE yang sama
      const chunk = decoder.decode(value, { stream: true });
      // Teruskan mentah-mentah ke frontend
      res.write(chunk);
    }

    res.end();
  } catch (error) {
    console.error('Groq stream error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
