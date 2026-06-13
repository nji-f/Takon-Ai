const supabaseUrl = 'https://pwhmmvldqmswhsvqszwc.supabase.co/';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB3aG1tdmxkcW1zd2hzdnFzendjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzNTgyMDEsImV4cCI6MjA5NjkzNDIwMX0.lLHYycC2FL9p2_5IUmoxg9CTPoE6O_wWT8MF8ID0qy8'
;
const supabase = supabase.createClient(supabaseUrl, supabaseKey);

let currentUser = null;
let chatContext = []; // Memori chat selama sesi berlangsung

async function register() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) document.getElementById('auth-msg').innerText = error.message;
    else document.getElementById('auth-msg').innerText = "Berhasil daftar! Silakan Login.";
}

async function login() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) document.getElementById('auth-msg').innerText = error.message;
    else window.location.href = 'chat.html';
}

async function checkSession() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) window.location.href = 'index.html';
    currentUser = session.user;
    loadHistory();
}

async function logout() {
    await supabase.auth.signOut();
    window.location.href = 'index.html';
}

async function loadHistory() {
    const { data, error } = await supabase
        .from('chat_history')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: true });
    
    const chatBox = document.getElementById('chat-box');
    if (data) {
        data.forEach(chat => {
            appendMessage(chat.role === 'user' ? 'Kamu' : 'TAKON-AI', chat.message, chat.role);
            // Masukkan ke konteks memori
            chatContext.push({
                role: chat.role === 'user' ? 'user' : 'model',
                parts: [{ text: chat.message }]
            });
        });
    }
}

async function sendMessage() {
    const inputField = document.getElementById('user-input');
    const text = inputField.value;
    if (!text) return;
    inputField.value = '';

    // Tampilkan di UI & simpan di Supabase
    appendMessage('Kamu', text, 'user');
    await supabase.from('chat_history').insert([{ user_id: currentUser.id, role: 'user', message: text }]);
    
    // Update konteks lokal untuk API
    chatContext.push({ role: 'user', parts: [{ text: text }] });

    // Panggil API Vercel
    const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: chatContext })
    });
    
    const result = await response.json();
    const aiText = result.candidates[0].content.parts[0].text;

    // Tampilkan balasan & simpan
    appendMessage('TAKON-AI', aiText, 'ai');
    await supabase.from('chat_history').insert([{ user_id: currentUser.id, role: 'model', message: aiText }]);
    
    // Update memori AI
    chatContext.push({ role: 'model', parts: [{ text: aiText }] });
}

function appendMessage(sender, text, role) {
    const chatBox = document.getElementById('chat-box');
    const msgDiv = document.createElement('div');
    msgDiv.className = `message msg-${role}`;
    msgDiv.innerHTML = `<strong>${sender}:</strong> <br>${text}`;
    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
}
