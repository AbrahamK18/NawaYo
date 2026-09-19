function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 2200);
}

async function handleSendReset(){
  const email = document.getElementById('forgot-email').value.trim();
  const errEl = document.getElementById('forgot-error');
  const infoEl = document.getElementById('forgot-info');
  errEl.classList.add('hidden'); infoEl.classList.add('hidden');

  if(!email){ errEl.textContent = 'Inserisci la tua email.'; errEl.classList.remove('hidden'); return; }

  const btn = document.getElementById('forgot-submit');
  btn.disabled = true;

  const redirectTo = window.location.origin + '/reset-password.html';
  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo });
  btn.disabled = false;

  if(error){ errEl.textContent = error.message; errEl.classList.remove('hidden'); return; }

  infoEl.textContent = 'Controlla la tua email: ti abbiamo inviato un link per reimpostare la password.';
  infoEl.classList.remove('hidden');
}
