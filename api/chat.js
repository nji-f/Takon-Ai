// api/chat.js
// Backend untuk Takon AI — menggunakan Gemini API langsung
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    res.status(500).json({ error: 'Server configuration error' });
    return;
  }

  const { messages, image, model = 'gemini-2.0-flash' } = req.body;

  // ── 1. Konversi messages OpenAI-style ➜ format Gemini contents ──
  let contents = [];
  for (const msg of messages) {
    // Lewati system prompt: Gemini tidak punya role system; bisa ditambahkan sebagai user message
    if (msg.role === 'system') {
      // Jika mau, bisa dijadikan pesan user pertama dengan teks "System: ..."
      contents.push({
        role: 'user',
        parts: [{ text: `[System]: ${msg.content}` }]
      });
      continue;
    }

    // Ubah role assistant → model
    const role = msg.role === 'assistant' ? 'model' : 'user';
    // Pastikan konten berbentuk array parts
    const parts = [{ text: msg.content }];
    contents.push({ role, parts });
  }

  // ── 2. Jika ada gambar, gabungkan ke pesan user terakhir ──
  if (image) {
    // Cari pesan terakhir dengan role 'user'
    let lastUserIdx = -1;
    for (let i = contents.length - 1; i >= 0; i--) {
      if (contents[i].role === 'user') {
        lastUserIdx = i;
        break;
      }
    }
    // Kalau tidak ditemukan (misal history kosong), buat pesan user baru
    if (lastUserIdx === -1) {
      contents.push({ role: 'user', parts: [] });
      lastUserIdx = contents.length - 1;
    }
    // Ekstrak mime type dan base64 dari data URL
    const match = image.match(/^data:(image\/\w+);base64,(.+)$/);
    if (match) {
      const mimeType = match[1];
      const base64Data = match[2];
      contents[lastUserIdx].parts.push({
        inlineData: {
          mimeType,
          data: base64Data
        }
      });
    } else {
      // Jika bukan data URL valid, abaikan
      console.warn('Invalid image data URL');
    }
  }

  // ── 3. Panggil Gemini API dengan SSE ──
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`;
  
  try {
    const geminiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 4096,
        },
        // safetySettings bisa disesuaikan jika perlu
      }),
    });

    if (!geminiRes.ok) {
      const errorText = await geminiRes.text();
      res.status(geminiRes.status).json({ error: errorText });
      return;
    }

    // ── 4. Baca SSE dari Gemini dan kirim ulang sebagai OpenAI-style stream ──
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const reader = geminiRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      // Simpan potongan terakhir yang belum lengkap
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const jsonStr = line.slice(6).trim();
        if (jsonStr === '[DONE]') continue;
        try {
          const parsed = JSON.parse(jsonStr);
          // Dapatkan teks dari candidates
          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            // Format OpenAI chunk
            const openAiChunk = JSON.stringify({
              choices: [{
                delta: { content: text }
              }]
            });
            res.write(`data: ${openAiChunk}\n\n`);
          }
        } catch (_) {
          // Skip json yang rusak
        }
      }
    }

    // Akhiri stream
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    console.error('Gemini stream error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
