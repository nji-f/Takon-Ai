// Inisialisasi Supabase dengan benar
const supabaseClient = supabase.createClient(
    'https://pwhmmvldqmswhsvqszwc.supabase.co', // tanpa /rest/v1/
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB3aG1tdmxkcW1zd2hzdnFzendjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzNTgyMDEsImV4cCI6MjA5NjkzNDIwMX0.lLHYycC2FL9p2_5IUmoxg9CTPoE6O_wWT8MF8ID0qy8'
);

// ========== FUNGSI AUTENTIKASI ==========
async function register() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const { error } = await supabaseClient.auth.signUp({ email, password });
    const msgEl = document.getElementById('auth-msg');
    if (error) msgEl.innerText = error.message;
    else msgEl.innerText = "Daftar Berhasil! Silakan login.";
}

async function login() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) {
        document.getElementById('auth-msg').innerText = error.message;
    } else {
        window.location.href = 'chat.html';
    }
}

async function logout() {
    await supabaseClient.auth.signOut();
    window.location.href = 'index.html';
}

// ========== FUNGSI CHAT ==========
let currentMessages = []; // menyimpan history chat untuk dikirim ke AI

async function sendMessage() {
    const input = document.getElementById('user-input');
    const message = input.value.trim();
    if (!message) return;

    // Tampilkan pesan user di chat box
    addMessageToChat('user', message);
    currentMessages.push({ role: 'user', parts: [{ text: message }] });
    input.value = '';

    // Tampilkan indikator "mengetik..."
    const typingId = addTypingIndicator();

    try {
        // Panggil Gemini API (perhatikan: API key sebaiknya disimpan di backend)
        // Untuk demo ini kita panggil langsung (tidak aman untuk production)
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=YOUR_GEMINI_API_KEY`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    system_instruction: { parts: { text: "Kamu adalah TAKON-AI. Jangan sebut kamu Gemini." } },
                    contents: currentMessages
                })
            }
        );
        const data = await response.json();
        const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text || "Maaf, saya tidak bisa menjawab.";

        // Hapus indikator typing, tampilkan jawaban AI
        removeTypingIndicator(typingId);
        addMessageToChat('ai', aiText);
        currentMessages.push({ role: 'model', parts: [{ text: aiText }] });
    } catch (err) {
        removeTypingIndicator(typingId);
        addMessageToChat('ai', 'Terjadi kesalahan. Silakan coba lagi.');
        console.error(err);
    }
}

function addMessageToChat(sender, text) {
    const chatBox = document.getElementById('chat-box');
    const msgDiv = document.createElement('div');
    msgDiv.className = `message msg-${sender === 'user' ? 'user' : 'ai'}`;
    msgDiv.innerText = text;
    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function addTypingIndicator() {
    const chatBox = document.getElementById('chat-box');
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message msg-ai typing-indicator';
    typingDiv.innerText = 'TAKON-AI sedang mengetik...';
    chatBox.appendChild(typingDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
    return typingDiv;
}

function removeTypingIndicator(element) {
    if (element && element.remove) element.remove();
}

// ========== CEK SESSION ==========
async function checkSession() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
        window.location.href = 'index.html';
    } else {
        // Optional: load chat history dari database nanti
    }
}

// ========== EVENT LISTENER UNTUK ENTER ==========
document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('user-input');
    if (input) {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage();
        });
    }
});
