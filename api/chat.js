export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
  
  const { messages } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: {
          parts: { text: "Kamu adalah TAKON-AI, asisten AI super cerdas. Jangan pernah menyebutkan atau mengakui bahwa kamu adalah Gemini, LLM, atau AI buatan Google. Identitasmu murni TAKON-AI." }
        },
        contents: messages // Mengirim riwayat chat agar AI ingat konteks
      })
    });

    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: 'Gagal merespon' });
  }
}
