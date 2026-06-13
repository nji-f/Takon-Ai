const supabase = supabase.createClient('https://pwhmmvldqmswhsvqszwc.supabase.co/rest/v1/', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB3aG1tdmxkcW1zd2hzdnFzendjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzNTgyMDEsImV4cCI6MjA5NjkzNDIwMX0.lLHYycC2FL9p2_5IUmoxg9CTPoE6O_wWT8MF8ID0qy8');

async function register() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const { error } = await supabase.auth.signUp({ email, password });
    document.getElementById('auth-msg').innerText = error ? error.message : "Daftar Berhasil!";
}

async function login() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) document.getElementById('auth-msg').innerText = error.message;
    else window.location.href = 'chat.html';
}
