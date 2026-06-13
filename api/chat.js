// File: pages/api/chat.js (Next.js 12+) atau app/api/chat/route.js (Next.js 13+ App Router)
export default async function handler(req, res) {
    // Hanya izinkan method POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { messages } = req.body;

    // Validasi input
    if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: 'Messages array required' });
    }

    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    system_instruction: { 
                        parts: { text: "Kamu adalah TAKON-AI. Jangan sebut kamu Gemini." } 
                    },
                    contents: messages
                })
            }
        );

        const data = await response.json();

        // Kirim respons yang sudah dibersihkan
        if (data.candidates && data.candidates[0]) {
            res.status(200).json({ 
                reply: data.candidates[0].content.parts[0].text 
            });
        } else {
            console.error('Gemini error:', data);
            res.status(500).json({ error: 'AI tidak merespon dengan benar' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Terjadi kesalahan pada server' });
    }
}
