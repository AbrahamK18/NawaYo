function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 2200);
}
function escapeHtml(s){
  if(s===undefined||s===null) return '';
  return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

let me = null;
let profilesCache = {};

window.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if(!session){
    document.getElementById('denied').classList.remove('hidden');
    document.getElementById('denied').querySelector('p:last-child').textContent = 'Devi prima accedere dal sito principale.';
    return;
  }
  me = session.user;

  const { data: adminRow } = await supabaseClient.from('admin_users').select('id').eq('id', me.id).maybeSingle();
  if(!adminRow){
    document.getElementById('denied').classList.remove('hidden');
    return;
  }

  document.getElementById('admin-content').classList.remove('hidden');
  loadStats();
});

function switchAdminTab(tab){
  ['stats','users','reports'].forEach(t=>{
    document.getElementById('admin-'+t).classList.add('hidden');
  });
  document.getElementById('admin-'+tab).classList.remove('hidden');
  document.querySelectorAll('.admin-nav button').forEach(b=>b.classList.toggle('active', b.dataset.tab===tab));
  if(tab==='stats') loadStats();
  if(tab==='users') loadUsers();
  if(tab==='reports') loadReports();
}

// ---------- STATS ----------
async function loadStats(){
  const el = document.getElementById('admin-stats');
  el.innerHTML = `<h2 class="section-title">Statistiche</h2><p style="color:var(--muted);font-size:0.85rem;">Caricamento...</p>`;

  const [{ count: totalUsers }, { count: totalLikes }, { count: totalMessages }, { count: pendingReports }] = await Promise.all([
    supabaseClient.from('profiles').select('*', { count: 'exact', head: true }),
    supabaseClient.from('swipes').select('*', { count: 'exact', head: true }).eq('liked', true),
    supabaseClient.from('messages').select('*', { count: 'exact', head: true }),
    supabaseClient.from('reports').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
  ]);

  el.innerHTML = `
    <h2 class="section-title">Statistiche</h2>
    <div class="stat-grid">
      <div class="stat-box"><div class="num">${totalUsers ?? 0}</div><div class="lbl">Utenti registrati</div></div>
      <div class="stat-box"><div class="num">${totalLikes ?? 0}</div><div class="lbl">Like totali</div></div>
      <div class="stat-box"><div class="num">${totalMessages ?? 0}</div><div class="lbl">Messaggi inviati</div></div>
      <div class="stat-box"><div class="num">${pendingReports ?? 0}</div><div class="lbl">Segnalazioni in attesa</div></div>
    </div>
  `;
}

// ---------- USERS ----------
async function loadUsers(){
  const el = document.getElementById('admin-users');
  el.innerHTML = `<h2 class="section-title">Utenti</h2><p style="color:var(--muted);font-size:0.85rem;">Caricamento...</p>`;
  const { data, error } = await supabaseClient.from('profiles').select('*').order('created_at', { ascending: false });
  if(error){ el.innerHTML = `<h2 class="section-title">Utenti</h2><p style="color:var(--muted);">Errore nel caricamento.</p>`; return; }

  (data||[]).forEach(p => profilesCache[p.id] = p);

  el.innerHTML = `<h2 class="section-title">Utenti (${(data||[]).length})</h2><div id="users-list"></div>`;
  const list = document.getElementById('users-list');
  if(!data || data.length===0){ list.innerHTML = `<p style="color:var(--muted);font-size:0.9rem;">Nessun utente.</p>`; return; }

  list.innerHTML = data.map(p => `
    <div class="admin-row">
      <div class="admin-row-top">
        <div class="row-avatar">${p.emoji||'✨'}</div>
        <div class="row-name">
          <div style="font-weight:600;">${escapeHtml(p.name||'(senza nome)')}, ${escapeHtml(p.age||'?')}</div>
          <div style="font-size:0.72rem;color:var(--muted);">${p.id}</div>
        </div>
        ${p.is_premium ? '<span class="pill-small premium-pill">Premium</span>' : ''}
        ${p.suspended ? '<span class="pill-small pill-suspended">Sospeso</span>' : ''}
      </div>
      <div class="admin-actions">
        <button onclick="toggleField('${p.id}','is_premium',${!p.is_premium})">${p.is_premium ? 'Rimuovi Premium' : 'Attiva Premium'}</button>
        <button onclick="toggleField('${p.id}','suspended',${!p.suspended})">${p.suspended ? 'Riattiva' : 'Sospendi'}</button>
        <button class="danger" onclick="deleteProfile('${p.id}')">Elimina profilo</button>
      </div>
    </div>
  `).join('');
}

async function toggleField(userId, field, value){
  const { error } = await supabaseClient.from('profiles').update({ [field]: value }).eq('id', userId);
  if(error){ toast('Operazione non riuscita.'); return; }
  toast('Aggiornato.');
  loadUsers();
}

async function deleteProfile(userId){
  const ok = window.confirm('Eliminare definitivamente questo profilo? Questa azione non elimina l\'account di autenticazione, solo i dati del profilo Anima.');
  if(!ok) return;
  const { error } = await supabaseClient.from('profiles').delete().eq('id', userId);
  if(error){ toast('Eliminazione non riuscita.'); return; }
  toast('Profilo eliminato.');
  loadUsers();
}

// ---------- REPORTS ----------
async function loadReports(){
  const el = document.getElementById('admin-reports');
  el.innerHTML = `<h2 class="section-title">Segnalazioni</h2><p style="color:var(--muted);font-size:0.85rem;">Caricamento...</p>`;
  const { data, error } = await supabaseClient.from('reports').select('*').eq('status','pending').order('created_at', { ascending: false });
  if(error){ el.innerHTML = `<h2 class="section-title">Segnalazioni</h2><p style="color:var(--muted);">Errore nel caricamento.</p>`; return; }

  el.innerHTML = `<h2 class="section-title">Segnalazioni in attesa (${(data||[]).length})</h2><div id="reports-list"></div>`;
  const list = document.getElementById('reports-list');
  if(!data || data.length===0){ list.innerHTML = `<p style="color:var(--muted);font-size:0.9rem;">Nessuna segnalazione in attesa.</p>`; return; }

  const ids = [...new Set(data.flatMap(r => [r.reporter_id, r.reported_id]))];
  const { data: profs } = await supabaseClient.from('profiles').select('*').in('id', ids);
  const byId = {}; (profs||[]).forEach(p => byId[p.id] = p);

  list.innerHTML = data.map(r => `
    <div class="admin-row">
      <div style="font-size:0.85rem;margin-bottom:6px;">
        <strong>${escapeHtml(byId[r.reporter_id]?.name || 'Utente')}</strong> ha segnalato
        <strong>${escapeHtml(byId[r.reported_id]?.name || 'Utente')}</strong>
      </div>
      ${r.reason ? `<div style="font-size:0.82rem;color:var(--muted);margin-bottom:8px;">"${escapeHtml(r.reason)}"</div>` : ''}
      <div class="admin-actions">
        <button onclick="resolveReport(${r.id},'resolved')">Segna come risolto</button>
        <button onclick="resolveReport(${r.id},'dismissed')">Ignora</button>
        <button class="danger" onclick="toggleField('${r.reported_id}','suspended',true)">Sospendi segnalato</button>
      </div>
    </div>
  `).join('');
}

async function resolveReport(reportId, status){
  const { error } = await supabaseClient.from('reports').update({ status }).eq('id', reportId);
  if(error){ toast('Operazione non riuscita.'); return; }
  toast('Segnalazione aggiornata.');
  loadReports();
}
