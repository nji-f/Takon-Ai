export default async function handler(req, res) {
    const { messages } = req.body;
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            system_instruction: { parts: { text: "Kamu adalah TAKON-AI. Jangan sebut kamu Gemini." } },
            contents: messages
        })
    });
    const data = await response.json();
    res.status(200).json(data);
}
