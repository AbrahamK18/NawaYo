const TAGS = ["Caffè","Escursioni","Cinema","Libri","Cucina","Viaggi","Musica","Videogiochi","Arte","Corsa","Yoga","Cani"];
const EMOJIS = ["✨","🌙","🌊","🔥","🌻","🍀","🎧","📚","🌵","🦋"];
const FREE_DAILY_LIKES = 8;

let session = null;      // supabase auth session
let me = null;           // { id, email }
let profile = null;      // row from profiles table
let isPremium = false;
let candidates = [], cardIndex = 0;
let matches = [];
let activeChat = null;
let messagesChannel = null;
let authMode = 'login';

function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 2200);
}
function escapeHtml(s){
  if(s===undefined||s===null) return '';
  return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function todayStartISO(){
  const d = new Date(); d.setHours(0,0,0,0); return d.toISOString();
}

// ---------- BOOT ----------
window.addEventListener('DOMContentLoaded', async () => {
  buildSetupPickers();

  const { data: { session: existing } } = await supabaseClient.auth.getSession();
  if(existing){ session = existing; await afterAuth(); }

  supabaseClient.auth.onAuthStateChange((event, newSession) => {
    session = newSession;
  });
});

function buildSetupPickers(){
  const er = document.getElementById('emoji-row');
  EMOJIS.forEach(e=>{
    const b = document.createElement('button');
    b.className='emoji-pick'; b.type='button'; b.textContent=e;
    b.onclick=()=>{ document.querySelectorAll('.emoji-pick').forEach(x=>x.classList.remove('sel')); b.classList.add('sel'); window._setupEmoji=e; };
    er.appendChild(b);
  });
  const tr = document.getElementById('tag-row');
  TAGS.forEach(t=>{
    const b = document.createElement('button');
    b.className='tag-pick'; b.type='button'; b.textContent=t;
    b.onclick=()=>{
      window._setupTags = window._setupTags || [];
      const idx = window._setupTags.indexOf(t);
      if(idx>-1){ window._setupTags.splice(idx,1); b.classList.remove('sel'); }
      else if(window._setupTags.length<5){ window._setupTags.push(t); b.classList.add('sel'); }
    };
    tr.appendChild(b);
  });
  document.getElementById('setup-bio').addEventListener('input', e=>{
    document.getElementById('bio-count').textContent = e.target.value.length;
  });
  window._setupEmoji = "✨"; window._setupTags = [];
}

// ---------- AUTH ----------
function setAuthMode(mode){
  authMode = mode;
  document.getElementById('toggle-login').classList.toggle('active', mode==='login');
  document.getElementById('toggle-signup').classList.toggle('active', mode==='signup');
  document.getElementById('auth-submit').textContent = mode==='login' ? 'Accedi' : 'Crea account';
  document.getElementById('auth-error').classList.add('hidden');
  document.getElementById('auth-info').classList.add('hidden');
}

async function handleAuthSubmit(){
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const errEl = document.getElementById('auth-error');
  const infoEl = document.getElementById('auth-info');
  errEl.classList.add('hidden'); infoEl.classList.add('hidden');

  if(!email || !password){ errEl.textContent='Inserisci email e password.'; errEl.classList.remove('hidden'); return; }
  if(password.length < 6){ errEl.textContent='La password deve avere almeno 6 caratteri.'; errEl.classList.remove('hidden'); return; }

  const btn = document.getElementById('auth-submit');
  btn.disabled = true;

  if(authMode === 'signup'){
    const { data, error } = await supabaseClient.auth.signUp({ email, password });
    btn.disabled = false;
    if(error){ errEl.textContent = error.message; errEl.classList.remove('hidden'); return; }
    if(data.session){
      session = data.session;
      await afterAuth();
    } else {
      infoEl.textContent = 'Controlla la tua email per confermare l\'account, poi accedi.';
      infoEl.classList.remove('hidden');
      setAuthMode('login');
    }
  } else {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    btn.disabled = false;
    if(error){ errEl.textContent = error.message; errEl.classList.remove('hidden'); return; }
    session = data.session;
    await afterAuth();
  }
}

async function afterAuth(){
  me = session.user;
  const { data: existingProfile } = await supabaseClient
    .from('profiles').select('*').eq('id', me.id).maybeSingle();
  if(existingProfile && existingProfile.name){
    profile = existingProfile;
    isPremium = !!profile.is_premium;
    showApp();
  } else {
    profile = { id: me.id, name:'', age:null, bio:'', tags:[], emoji:'✨', is_premium:false, verified:false };
    document.getElementById('screen-auth').classList.add('hidden');
    document.getElementById('screen-setup').classList.remove('hidden');
  }
}

async function finishSetup(){
  const name = document.getElementById('setup-name').value.trim();
  const age = parseInt(document.getElementById('setup-age').value.trim(), 10);
  const bio = document.getElementById('setup-bio').value.trim();
  if(!name || !age){ toast('Aggiungi nome ed età.'); return; }

  const payload = { id: me.id, name, age, bio, tags: window._setupTags||[], emoji: window._setupEmoji||'✨' };
  const { error } = await supabaseClient.from('profiles').upsert(payload);
  if(error){ toast('Salvataggio non riuscito: ' + error.message); return; }
  profile = { ...profile, ...payload };
  showApp();
}

async function logout(){
  await supabaseClient.auth.signOut();
  if(messagesChannel){ supabaseClient.removeChannel(messagesChannel); messagesChannel=null; }
  me=null; profile=null; isPremium=false; session=null;
  document.getElementById('screen-app').classList.add('hidden');
  document.getElementById('screen-setup').classList.add('hidden');
  document.getElementById('screen-auth').classList.remove('hidden');
  document.getElementById('auth-email').value=''; document.getElementById('auth-password').value='';
}

function showApp(){
  document.getElementById('screen-auth').classList.add('hidden');
  document.getElementById('screen-setup').classList.add('hidden');
  document.getElementById('screen-app').classList.remove('hidden');
  updateStatusPill();
  switchTab('browse');
}
function updateStatusPill(){
  const pill = document.getElementById('status-pill');
  pill.textContent = isPremium ? 'Premium' : 'Gratuito';
  pill.className = isPremium ? 'premium-pill' : 'free-pill';
}

// ---------- TABS ----------
function switchTab(tab){
  ['browse','likes','matches','chat','premium','profile'].forEach(t=>{
    document.getElementById('tab-'+t).classList.add('hidden');
  });
  document.getElementById('tab-'+tab).classList.remove('hidden');
  document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active', b.dataset.tab===tab || (tab==='chat'&&b.dataset.tab==='matches')));
  if(messagesChannel && tab!=='chat'){ supabaseClient.removeChannel(messagesChannel); messagesChannel=null; }
  if(tab==='browse') loadBrowse();
  if(tab==='likes') loadLikes();
  if(tab==='matches') loadMatches();
  if(tab==='premium') renderPremium();
  if(tab==='profile') renderProfile();
}

// ---------- BROWSE ----------
async function loadBrowse(){
  const { data: allProfiles } = await supabaseClient.from('profiles').select('*').neq('id', me.id);
  const { data: mySwipes } = await supabaseClient.from('swipes').select('target_id').eq('swiper_id', me.id);
  const swiped = new Set((mySwipes||[]).map(s=>s.target_id));
  candidates = (allProfiles||[]).filter(p => p.name && !swiped.has(p.id));
  cardIndex = 0;
  renderBrowse();
}

function renderBrowse(){
  const el = document.getElementById('tab-browse');
  const c = candidates[cardIndex];
  if(!c){
    el.innerHTML = `<div class="empty-state"><div style="font-size:1.6rem;">✨</div><p class="display" style="font-size:1.3rem;color:var(--ink);">Per ora è tutto</p><p>Torna più tardi per nuovi profili.</p><button class="btn-outline" onclick="loadBrowse()">Aggiorna</button></div>`;
    return;
  }
  el.innerHTML = `
    <div class="card-wrap">
      <div class="swipe-card">
        <div class="avatar-big">${c.emoji||'✨'}</div>
        <div class="name-row"><h3>${escapeHtml(c.name)}, ${escapeHtml(c.age)}</h3>${c.verified?'<span class="verified">✔</span>':''}</div>
        <p class="bio-text">${escapeHtml(c.bio||'Nessuna bio.')}</p>
        <div class="tags-mini">${(c.tags||[]).map(t=>`<span class="tag-chip">${escapeHtml(t)}</span>`).join('')}</div>
      </div>
    </div>
    <div class="action-row">
      <button class="round-btn btn-pass" onclick="decide(false)">✕</button>
      <button class="round-btn btn-like" onclick="decide(true)">♥</button>
    </div>
  `;
}

async function decide(liked){
  const target = candidates[cardIndex];
  if(!target) return;

  if(liked && !isPremium){
    const { data: todaysLikes } = await supabaseClient
      .from('swipes').select('id')
      .eq('swiper_id', me.id).eq('liked', true)
      .gte('created_at', todayStartISO());
    if((todaysLikes||[]).length >= FREE_DAILY_LIKES){
      toast('Hai raggiunto il limite giornaliero gratuito. Passa a Premium per like illimitati.');
      cardIndex++; renderBrowse(); return;
    }
  }

  await supabaseClient.from('swipes').insert({ swiper_id: me.id, target_id: target.id, liked });

  if(liked){
    const { data: theirSwipe } = await supabaseClient
      .from('swipes').select('*')
      .eq('swiper_id', target.id).eq('target_id', me.id).eq('liked', true)
      .maybeSingle();
    if(theirSwipe) showMatchPopup(target);
  }
  cardIndex++;
  renderBrowse();
}

// ---------- LIKES RECEIVED (premium gate) ----------
async function loadLikes(){
  const el = document.getElementById('tab-likes');
  el.innerHTML = `<h2 class="section-title">Chi ti ha messo like</h2><div id="likes-list">Caricamento...</div>`;
  const { data: incoming } = await supabaseClient.from('swipes').select('swiper_id').eq('target_id', me.id).eq('liked', true);
  const ids = (incoming||[]).map(s=>s.swiper_id);
  let admirers = [];
  if(ids.length){
    const { data } = await supabaseClient.from('profiles').select('*').in('id', ids);
    admirers = data || [];
  }
  const listEl = document.getElementById('likes-list');
  if(admirers.length===0){
    listEl.innerHTML = `<p style="color:var(--muted);font-size:0.9rem;">Nessun like ricevuto per ora.</p>`;
    return;
  }
  const rows = admirers.map(a=>`
    <div class="row-card" ${isPremium?`onclick='likeBack(${JSON.stringify(a.id)})'`:''} style="${isPremium?'':'cursor:default;'}">
      <div class="row-avatar">${a.emoji||'✨'}</div>
      <div style="flex:1;"><div class="row-name">${isPremium? escapeHtml(a.name)+', '+escapeHtml(a.age) : '???'}</div><div class="row-sub">${isPremium? escapeHtml(a.bio||'') : 'Sblocca Premium per vedere chi è'}</div></div>
    </div>`).join('');
  if(isPremium){
    listEl.innerHTML = rows;
  } else {
    listEl.innerHTML = `<div class="locked-box">${rows}</div>
      <div style="text-align:center;margin-top:16px;">
        <button class="btn-primary btn-gold" style="max-width:220px;" onclick="switchTab('premium')">👑 Sblocca con Premium</button>
      </div>`;
  }
}
async function likeBack(targetId){
  await supabaseClient.from('swipes').upsert({ swiper_id: me.id, target_id: targetId, liked: true });
  const { data: p } = await supabaseClient.from('profiles').select('*').eq('id', targetId).maybeSingle();
  if(p) showMatchPopup(p);
  loadLikes();
}

// ---------- MATCHES ----------
async function loadMatches(){
  const { data: myLikes } = await supabaseClient.from('swipes').select('target_id').eq('swiper_id', me.id).eq('liked', true);
  const ids = (myLikes||[]).map(s=>s.target_id);
  matches = [];
  if(ids.length){
    const { data: backLikes } = await supabaseClient.from('swipes').select('swiper_id').eq('target_id', me.id).eq('liked', true).in('swiper_id', ids);
    const matchedIds = (backLikes||[]).map(s=>s.swiper_id);
    if(matchedIds.length){
      const { data } = await supabaseClient.from('profiles').select('*').in('id', matchedIds);
      matches = data || [];
    }
  }
  renderMatches();
}
function renderMatches(){
  const el = document.getElementById('tab-matches');
  el.innerHTML = `<h2 class="section-title">I tuoi incontri</h2><div id="matches-list"></div>`;
  const listEl = document.getElementById('matches-list');
  if(matches.length===0){ listEl.innerHTML = `<p style="color:var(--muted);font-size:0.9rem;">Nessun incontro ancora — continua a scoprire profili.</p>`; return; }
  listEl.innerHTML = matches.map(m=>`
    <div class="row-card" onclick='openChat(${JSON.stringify(m).replace(/'/g,"&#39;")})'>
      <div class="row-avatar">${m.emoji||'✨'}</div>
      <div style="flex:1;"><div class="row-name">${escapeHtml(m.name)}, ${escapeHtml(m.age)}</div><div class="row-sub">${escapeHtml(m.bio||'Di ciao 👋')}</div></div>
      <span style="color:var(--wine);">💬</span>
    </div>`).join('');
}

// ---------- MATCH POPUP ----------
let pendingMatchUser = null;
function showMatchPopup(user){
  pendingMatchUser = user;
  document.getElementById('match-popup-text').textContent = `Tu e ${user.name} vi siete piaciuti a vicenda.`;
  document.getElementById('match-popup').classList.remove('hidden');
}
function closeMatchPopup(){ document.getElementById('match-popup').classList.add('hidden'); pendingMatchUser=null; }
function goToMatchChat(){
  const u = pendingMatchUser;
  document.getElementById('match-popup').classList.add('hidden');
  if(u) openChat(u);
}

// ---------- CHAT (realtime) ----------
function openChat(user){
  activeChat = user;
  switchTab('chat');
  renderChatHeader();
  loadMessages();
  subscribeToMessages();
}
function renderChatHeader(){
  const el = document.getElementById('tab-chat');
  el.innerHTML = `
    <div class="chat-header">
      <button onclick="switchTab('matches')">←</button>
      <div class="row-avatar" style="width:36px;height:36px;font-size:1.1rem;">${activeChat.emoji||'✨'}</div>
      <span style="font-weight:600;">${escapeHtml(activeChat.name)}</span>
    </div>
    <div class="chat-body" id="chat-body"></div>
    <div class="chat-input-row">
      <input id="chat-input" placeholder="Scrivi un messaggio" onkeydown="if(event.key==='Enter')sendMessage()" />
      <button class="send-btn" onclick="sendMessage()">➤</button>
    </div>
  `;
}
async function loadMessages(){
  if(!activeChat) return;
  const { data } = await supabaseClient
    .from('messages').select('*')
    .or(`and(sender_id.eq.${me.id},receiver_id.eq.${activeChat.id}),and(sender_id.eq.${activeChat.id},receiver_id.eq.${me.id})`)
    .order('created_at', { ascending: true });
  renderMessages(data || []);
}
function renderMessages(arr){
  const body = document.getElementById('chat-body');
  if(!body) return;
  if(arr.length===0){
    body.innerHTML = `<p style="text-align:center;color:var(--muted);font-size:0.85rem;margin-top:24px;">Vi siete trovati! Scrivi il primo messaggio 🔥</p>`;
  } else {
    body.innerHTML = arr.map(m=>`<div class="bubble ${m.sender_id===me.id?'me':'them'}">${escapeHtml(m.content)}</div>`).join('');
  }
  body.scrollTop = body.scrollHeight;
}
function subscribeToMessages(){
  if(messagesChannel){ supabaseClient.removeChannel(messagesChannel); }
  messagesChannel = supabaseClient
    .channel('messages-'+activeChat.id)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
      const m = payload.new;
      const relevant = (m.sender_id===me.id && m.receiver_id===activeChat.id) || (m.sender_id===activeChat.id && m.receiver_id===me.id);
      if(relevant) loadMessages();
    })
    .subscribe();
}
async function sendMessage(){
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if(!text || !activeChat) return;
  input.value='';
  const { error } = await supabaseClient.from('messages').insert({ sender_id: me.id, receiver_id: activeChat.id, content: text });
  if(error){ toast('Messaggio non inviato.'); return; }
  loadMessages();
}

// ---------- PREMIUM (demo — nessun pagamento reale) ----------
function renderPremium(){
  const el = document.getElementById('tab-premium');
  if(isPremium){
    el.innerHTML = `
      <div class="premium-card">
        <h3>Sei Premium 👑</h3>
        <p style="font-size:0.85rem;">Hai accesso completo: vedi chi ti ha messo like, like illimitati e il badge di verifica sul tuo profilo.</p>
      </div>
      <button class="btn-outline" onclick="togglePremium(false)">Disattiva Premium (demo)</button>
    `;
  } else {
    el.innerHTML = `
      <div class="premium-card">
        <h3>Passa a Premium</h3>
        <div class="price">€9,99<span style="font-size:0.9rem;color:#EDE1D8;">/mese</span></div>
        <ul>
          <li>Vedi chi ti ha già messo like</li>
          <li>Like illimitati ogni giorno</li>
          <li>Badge di profilo verificato</li>
        </ul>
      </div>
      <button class="btn-primary btn-gold" onclick="togglePremium(true)">Sblocca Premium (demo)</button>
      <p class="disclaimer" style="text-align:center;">Nessun pagamento reale viene effettuato qui: per accettare dei pagamenti veri servirebbe integrare Stripe.</p>
    `;
  }
}
async function togglePremium(val){
  isPremium = val;
  await supabaseClient.from('profiles').update({ is_premium: val, verified: val }).eq('id', me.id);
  profile.is_premium = val; profile.verified = val;
  updateStatusPill();
  toast(val ? 'Premium attivato (demo).' : 'Premium disattivato.');
  renderPremium();
}

// ---------- PROFILE ----------
function renderProfile(){
  const el = document.getElementById('tab-profile');
  el.innerHTML = `
    <h2 class="section-title">Il tuo profilo</h2>
    <div class="profile-card">
      <div class="avatar-big">${profile.emoji}</div>
      <div class="name-row"><h3>${escapeHtml(profile.name)}, ${escapeHtml(profile.age)}</h3>${isPremium?'<span class="verified">✔</span>':''}</div>
      <p class="bio-text">${escapeHtml(profile.bio||'')}</p>
      <div class="tags-mini">${(profile.tags||[]).map(t=>`<span class="tag-chip">${escapeHtml(t)}</span>`).join('')}</div>
    </div>
    <button class="btn-outline" onclick="editProfile()">Modifica profilo</button>
    <button class="btn-logout" onclick="logout()">Esci</button>
  `;
}
function editProfile(){
  document.getElementById('screen-app').classList.add('hidden');
  document.getElementById('screen-setup').classList.remove('hidden');
  document.getElementById('setup-name').value = profile.name;
  document.getElementById('setup-age').value = profile.age;
  document.getElementById('setup-bio').value = profile.bio;
  document.getElementById('bio-count').textContent = (profile.bio||'').length;
  window._setupEmoji = profile.emoji; window._setupTags = [...(profile.tags||[])];
  document.querySelectorAll('.emoji-pick').forEach(b=>b.classList.toggle('sel', b.textContent===profile.emoji));
  document.querySelectorAll('.tag-pick').forEach(b=>b.classList.toggle('sel', (profile.tags||[]).includes(b.textContent)));
}
