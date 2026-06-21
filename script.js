(function(){
  "use strict";

  /* ---------- Data ---------- */
  const DEFAULT_CATEGORIES = [
    { id:'ocio',       name:'Ocio',        color:'#4D96FF', isDefault:true },
    { id:'necesidad',  name:'Necesidad',   color:'#FF6B6B', isDefault:true },
    { id:'obligacion', name:'Obligación',  color:'#FFC85C', isDefault:true },
    { id:'ari',        name:'Ari',         color:'#FF8FB1', isDefault:true }
  ];

  const PALETTE = [
    '#FF6B6B','#FF8FB1','#FFC85C','#4D96FF','#4DD0E1','#9B5DE5',
    '#7C5CFC','#2EC4B6','#43AA8B','#F4A261','#06D6A0','#EF476F',
    '#118AB2','#FFD166'
  ];

  let currentCategories = DEFAULT_CATEGORIES.map(c=>({...c}));
  let currentPayments = [];
  let currentResults = null;
  let history = [];
  let selectedCategoryColor = null;
  let confirmCallback = null;

  /* ---------- Helpers ---------- */
  function genId(prefix){
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2,7);
  }
  function escapeHTML(str){
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }
  function formatEuro(n){
    const v = Math.round((n + Number.EPSILON) * 100) / 100;
    return v.toLocaleString('es-ES', { minimumFractionDigits:2, maximumFractionDigits:2 }) + ' €';
  }
  function $(id){ return document.getElementById(id); }

  function showFieldError(id, msg){
    const el = $(id);
    el.textContent = msg;
    el.classList.add('visible');
    clearTimeout(el._t);
    el._t = setTimeout(()=> el.classList.remove('visible'), 3500);
  }
  function clearFieldError(id){
    $(id).classList.remove('visible');
  }

  function showToast(msg, type){
    type = type || 'info';
    const c = $('toastContainer');
    const t = document.createElement('div');
    t.className = 'toast ' + type;
    t.textContent = msg;
    c.appendChild(t);
    requestAnimationFrame(()=> t.classList.add('show'));
    setTimeout(()=>{
      t.classList.remove('show');
      setTimeout(()=> t.remove(), 300);
    }, 3000);
  }

  function openModal(id){
    const el = $(id);
    el.classList.remove('hidden');
    requestAnimationFrame(()=> el.classList.add('open'));
  }
  function closeModal(id){
    const el = $(id);
    el.classList.remove('open');
    setTimeout(()=> el.classList.add('hidden'), 220);
  }
  function showConfirm(msg, cb){
    $('confirmMessage').textContent = msg;
    confirmCallback = cb;
    openModal('confirmModal');
  }

  /* ---------- Tabs ---------- */
  function switchTab(tab){
    document.querySelectorAll('.tab-btn').forEach(b=> b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.view').forEach(v=> v.classList.remove('active'));
    $('view-' + tab).classList.add('active');
    if (tab === 'history') renderHistory();
  }

  /* ---------- Categories (builder) ---------- */
  function renderCategorySelect(){
    const sel = $('paymentCategory');
    const prev = sel.value;
    sel.innerHTML = currentCategories.map(c=>
      '<option value="' + c.id + '">' + escapeHTML(c.name) + '</option>'
    ).join('');
    if (currentCategories.some(c=> c.id === prev)) sel.value = prev;
  }

  function renderCategoryLegend(){
    const el = $('categoryLegend');
    el.innerHTML = currentCategories.map(c=>
      '<span class="legend-chip" style="background:' + c.color + '22; color:' + c.color + '; border:1px solid ' + c.color + '55;">' +
        '<span class="dot" style="background:' + c.color + '"></span>' + escapeHTML(c.name) +
        (!c.isDefault ? '<button type="button" class="chip-remove" data-id="' + c.id + '">×</button>' : '') +
      '</span>'
    ).join('');
    el.querySelectorAll('.chip-remove').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const id = btn.dataset.id;
        if (currentPayments.some(p=> p.categoryId === id)){
          showToast('No puedes eliminar una categoría que ya tiene pagos asociados', 'error');
          return;
        }
        currentCategories = currentCategories.filter(c=> c.id !== id);
        renderCategorySelect();
        renderCategoryLegend();
      });
    });
  }

  function renderPalette(){
    const container = $('colorPalette');
    container.innerHTML = PALETTE.map(c=>
      '<button type="button" class="swatch" style="background:' + c + '" data-color="' + c + '"></button>'
    ).join('');
    container.querySelectorAll('.swatch').forEach(sw=>{
      sw.addEventListener('click', ()=>{
        container.querySelectorAll('.swatch').forEach(s=> s.classList.remove('selected'));
        sw.classList.add('selected');
        selectedCategoryColor = sw.dataset.color;
      });
    });
  }

  function openCreateCategoryModal(){
    $('newCategoryName').value = '';
    selectedCategoryColor = null;
    clearFieldError('categoryError');
    renderPalette();
    openModal('categoryModal');
  }

  function confirmCreateCategory(){
    const name = $('newCategoryName').value.trim();
    if (!name){ showFieldError('categoryError', 'Ponle un nombre a la categoría'); return; }
    if (currentCategories.some(c=> c.name.toLowerCase() === name.toLowerCase())){
      showFieldError('categoryError', 'Ya existe una categoría con ese nombre en este ticket');
      return;
    }
    if (!selectedCategoryColor){ showFieldError('categoryError', 'Elige un color'); return; }

    const newCat = { id: genId('c'), name, color: selectedCategoryColor, isDefault:false };
    currentCategories.push(newCat);
    renderCategorySelect();
    renderCategoryLegend();
    $('paymentCategory').value = newCat.id;
    closeModal('categoryModal');
    showToast('Categoría "' + name + '" creada', 'success');
  }

  /* ---------- Payments ---------- */
  function renderPaymentsList(){
    const el = $('paymentsList');
    if (currentPayments.length === 0){
      el.innerHTML = '<p class="empty-hint">Aún no has añadido pagos</p>';
      return;
    }
    el.innerHTML = currentPayments.map(p=>
      '<div class="payment-row">' +
        '<span class="dot" style="background:' + p.categoryColor + '"></span>' +
        '<span class="payment-name">' + escapeHTML(p.name) + '</span>' +
        '<span class="payment-cat">' + escapeHTML(p.categoryName) + '</span>' +
        '<span class="payment-price">' + formatEuro(p.price) + '</span>' +
        '<button type="button" class="payment-remove" data-id="' + p.id + '">×</button>' +
      '</div>'
    ).join('');
    el.querySelectorAll('.payment-remove').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        currentPayments = currentPayments.filter(p=> p.id !== btn.dataset.id);
        renderPaymentsList();
        hideResults();
      });
    });
  }

  function addPayment(){
    const categoryId = $('paymentCategory').value;
    const nameInput = $('paymentName');
    const priceInput = $('paymentPrice');
    const name = nameInput.value.trim();
    const price = parseFloat(priceInput.value);

    if (!name){ showFieldError('paymentError', 'Ponle un nombre al gasto'); return; }
    if (isNaN(price) || price <= 0){ showFieldError('paymentError', 'Indica un precio válido'); return; }

    const cat = currentCategories.find(c=> c.id === categoryId);
    if (!cat){ showFieldError('paymentError', 'Selecciona una categoría'); return; }

    currentPayments.push({
      id: genId('p'),
      categoryId: cat.id,
      categoryName: cat.name,
      categoryColor: cat.color,
      name,
      price
    });

    nameInput.value = '';
    priceInput.value = '';
    nameInput.focus();
    renderPaymentsList();
    hideResults();
  }

  function hideResults(){
    currentResults = null;
    $('resultsSection').classList.add('hidden');
  }

  /* ---------- Sum / results ---------- */
  function renderCategoryBars(totals, grandTotal){
    const container = $('categoryBars');
    container.innerHTML = '';
    totals.forEach(t=>{
      const pct = grandTotal > 0 ? (t.total / grandTotal * 100) : 0;
      const row = document.createElement('div');
      row.className = 'bar-row';
      row.innerHTML =
        '<div class="bar-label"><span class="dot" style="background:' + t.color + '"></span>' +
        escapeHTML(t.name) + '<span class="bar-amount">' + formatEuro(t.total) + '</span></div>' +
        '<div class="bar-track"><div class="bar-fill" style="background:' + t.color + '"></div></div>';
      container.appendChild(row);
      const fill = row.querySelector('.bar-fill');
      requestAnimationFrame(()=> requestAnimationFrame(()=> { fill.style.width = pct + '%'; }));
    });
  }

  function renderGoalMessage(goal, exceeded, diff){
    const el = $('goalMessage');
    if (exceeded){
      el.className = 'goal-message exceeded';
      el.innerHTML = '⚠️ <strong>Has superado tu objetivo</strong> en ' + formatEuro(diff) +
                      ' (objetivo: ' + formatEuro(goal) + ')';
    } else {
      el.className = 'goal-message ok';
      el.innerHTML = '✅ Dentro del objetivo. Te quedan ' + formatEuro(diff) +
                      ' de margen (objetivo: ' + formatEuro(goal) + ')';
    }
  }

  function calculateSum(){
    const name = $('ticketName').value.trim();
    const goal = parseFloat($('ticketGoal').value);

    if (!name){ showFieldError('builderError', 'Ponle un nombre a tu ticket (mes y año)'); return; }
    if (isNaN(goal) || goal < 0){ showFieldError('builderError', 'Indica tu objetivo de gasto'); return; }
    if (currentPayments.length === 0){ showFieldError('paymentError', 'Añade al menos un pago antes de sumar'); return; }

    const totalsMap = {};
    currentPayments.forEach(p=>{
      if (!totalsMap[p.categoryId]){
        totalsMap[p.categoryId] = { id:p.categoryId, name:p.categoryName, color:p.categoryColor, total:0 };
      }
      totalsMap[p.categoryId].total += p.price;
    });
    const totalsByCategory = Object.values(totalsMap).sort((a,b)=> b.total - a.total);
    const grandTotal = totalsByCategory.reduce((s,c)=> s + c.total, 0);
    const exceeded = grandTotal > goal;
    const diff = Math.abs(grandTotal - goal);

    currentResults = { totalsByCategory, grandTotal, goal, exceeded, diff };

    renderCategoryBars(totalsByCategory, grandTotal);
    $('grandTotalValue').textContent = formatEuro(grandTotal);
    renderGoalMessage(goal, exceeded, diff);

    const section = $('resultsSection');
    section.classList.remove('hidden');
    section.scrollIntoView({ behavior:'smooth', block:'nearest' });
  }

  /* ---------- Receipt building ---------- */
  function buildReceiptHTML(ticket){
    const dateStr = new Date(ticket.createdAt).toLocaleString('es-ES', {
      day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit'
    });

    let categoriesHTML = '';
    ticket.categories.forEach(cat=>{
      const pays = ticket.payments.filter(p=> p.categoryId === cat.id);
      if (pays.length === 0) return;
      const subtotal = pays.reduce((s,p)=> s + p.price, 0);
      const linesHTML = pays.map(p=>
        '<div class="receipt-line"><span>' + escapeHTML(p.name) + '</span>' +
        '<span class="dots"></span><span>' + formatEuro(p.price) + '</span></div>'
      ).join('');
      categoriesHTML +=
        '<div class="receipt-category">' +
          '<span class="cat-name" style="background:' + cat.color + '">' + escapeHTML(cat.name) + '</span>' +
          linesHTML +
          '<div class="receipt-subtotal">Subtotal: ' + formatEuro(subtotal) + '</div>' +
        '</div>';
    });

    const statusClass = ticket.exceeded ? 'exceeded' : 'ok';
    const statusText = ticket.exceeded
      ? '⚠️ Has superado el objetivo en ' + formatEuro(ticket.diff)
      : '✅ Dentro del objetivo (quedan ' + formatEuro(ticket.diff) + ')';

    return (
      '<div class="receipt">' +
        '<div class="receipt-header">' +
          '<div class="ticket-emoji">🧾</div>' +
          '<h3>' + escapeHTML(ticket.name) + '</h3>' +
          '<div class="receipt-date">' + dateStr + '</div>' +
        '</div>' +
        categoriesHTML +
        '<div class="receipt-total-row"><span>TOTAL</span><span>' + formatEuro(ticket.grandTotal) + '</span></div>' +
        '<div class="receipt-goal-row"><span>Objetivo</span><span>' + formatEuro(ticket.goal) + '</span></div>' +
        '<div class="receipt-status ' + statusClass + '">' + statusText + '</div>' +
        '<div class="barcode"></div>' +
        '<div class="receipt-footer">GRACIAS POR REGISTRAR TUS GASTOS</div>' +
      '</div>'
    );
  }

  function showReceiptModal(ticket, isNew){
    $('receiptContainer').innerHTML = buildReceiptHTML(ticket);
    $('ticketDetailModal').dataset.ticketId = ticket.id;
    openModal('ticketDetailModal');
    if (isNew) showToast('✅ Ticket guardado en tu historial', 'success');
  }

  /* ---------- Finalize ticket ---------- */
  function resetBuilder(){
    $('ticketName').value = '';
    $('ticketGoal').value = '';
    currentPayments = [];
    currentCategories = DEFAULT_CATEGORIES.map(c=>({...c}));
    currentResults = null;
    renderCategorySelect();
    renderCategoryLegend();
    renderPaymentsList();
    $('resultsSection').classList.add('hidden');
  }

  function realizarTicket(){
    if (!currentResults) return;
    const usedCategories = currentCategories.filter(c=> currentPayments.some(p=> p.categoryId === c.id));
    const ticket = {
      id: genId('t'),
      name: $('ticketName').value.trim(),
      goal: currentResults.goal,
      payments: currentPayments.map(p=> ({...p})),
      categories: usedCategories.map(c=> ({ id:c.id, name:c.name, color:c.color })),
      totalsByCategory: currentResults.totalsByCategory,
      grandTotal: currentResults.grandTotal,
      exceeded: currentResults.exceeded,
      diff: currentResults.diff,
      createdAt: new Date().toISOString()
    };
    history.unshift(ticket);
    saveHistory();
    showReceiptModal(ticket, true);
    resetBuilder();
  }

  /* ---------- History ---------- */
  function renderHistory(){
    const container = $('historyList');
    if (history.length === 0){
      container.innerHTML = '<p class="empty-state">Aún no tienes tickets guardados. ¡Crea el primero en la pestaña "Nuevo Ticket"! 🎉</p>';
      return;
    }
    container.innerHTML = history.map(t=>
      '<div class="history-card" data-id="' + t.id + '">' +
        '<div class="history-card-main">' +
          '<h4>' + escapeHTML(t.name) + '</h4>' +
          '<span class="history-date">' + new Date(t.createdAt).toLocaleDateString('es-ES', { day:'2-digit', month:'short', year:'numeric' }) + '</span>' +
        '</div>' +
        '<div class="history-card-total">' +
          '<strong>' + formatEuro(t.grandTotal) + '</strong>' +
          '<span class="badge ' + (t.exceeded ? 'exceeded' : 'ok') + '">' + (t.exceeded ? 'Superado' : 'OK') + '</span>' +
        '</div>' +
      '</div>'
    ).join('');
    container.querySelectorAll('.history-card').forEach(card=>{
      card.addEventListener('click', ()=>{
        const ticket = history.find(t=> t.id === card.dataset.id);
        if (ticket) showReceiptModal(ticket, false);
      });
    });
  }

  /* ---------- Persistence ---------- */
  async function saveHistory(){
    try{
      const result = await window.storage.set('tickets', JSON.stringify(history), false);
      if (!result) showToast('No se pudo guardar el ticket de forma persistente', 'error');
    }catch(err){
      console.error('Storage error', err);
      showToast('No se pudo guardar el ticket de forma persistente', 'error');
    }
  }

  async function loadHistory(){
    try{
      const result = await window.storage.get('tickets', false);
      history = result ? JSON.parse(result.value) : [];
    }catch(err){
      history = [];
    }
    renderHistory();
  }

  /* ---------- Export / Import ---------- */
  function exportJSON(){
    if (history.length === 0){ showToast('Aún no tienes tickets que exportar', 'error'); return; }
    const blob = new Blob([JSON.stringify(history, null, 2)], { type:'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tickets_gastos.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Historial exportado ✅', 'success');
  }

  function importJSONFile(file){
    const reader = new FileReader();
    reader.onload = (ev)=>{
      try{
        const data = JSON.parse(ev.target.result);
        if (!Array.isArray(data)) throw new Error('formato inválido');
        showConfirm(
          'Se importarán ' + data.length + ' ticket(s). Esto reemplazará tu historial actual. ¿Continuar?',
          async ()=>{
            history = data;
            await saveHistory();
            renderHistory();
            showToast('Historial importado ✅', 'success');
          }
        );
      }catch(err){
        showToast('El archivo no es un JSON de tickets válido', 'error');
      }
    };
    reader.readAsText(file);
  }

  /* ---------- Wire events ---------- */
  function wireEvents(){
    document.querySelectorAll('.tab-btn').forEach(btn=>{
      btn.addEventListener('click', ()=> switchTab(btn.dataset.tab));
    });

    $('btnOpenCategoryModal').addEventListener('click', openCreateCategoryModal);
    $('btnCancelCategory').addEventListener('click', ()=> closeModal('categoryModal'));
    $('btnConfirmCategory').addEventListener('click', confirmCreateCategory);

    $('btnAddPayment').addEventListener('click', addPayment);
    ['paymentName','paymentPrice'].forEach(id=>{
      $(id).addEventListener('keydown', e=>{
        if (e.key === 'Enter'){ e.preventDefault(); addPayment(); }
      });
    });

    $('btnSum').addEventListener('click', calculateSum);
    $('btnRealizarTicket').addEventListener('click', realizarTicket);

    $('btnExport').addEventListener('click', exportJSON);
    $('importInput').addEventListener('change', (e)=>{
      const file = e.target.files[0];
      if (file) importJSONFile(file);
      e.target.value = '';
    });

    $('btnCloseReceipt').addEventListener('click', ()=> closeModal('ticketDetailModal'));
    $('btnDeleteFromDetail').addEventListener('click', ()=>{
      const id = $('ticketDetailModal').dataset.ticketId;
      closeModal('ticketDetailModal');
      showConfirm('¿Eliminar este ticket? Esta acción no se puede deshacer.', ()=>{
        history = history.filter(t=> t.id !== id);
        saveHistory();
        renderHistory();
        showToast('Ticket eliminado', 'info');
      });
    });

    $('btnConfirmOk').addEventListener('click', ()=>{
      closeModal('confirmModal');
      const cb = confirmCallback;
      confirmCallback = null;
      if (cb) cb();
    });
    $('btnConfirmCancel').addEventListener('click', ()=>{
      closeModal('confirmModal');
      confirmCallback = null;
    });

    document.querySelectorAll('.modal-overlay').forEach(overlay=>{
      overlay.addEventListener('click', (e)=>{
        if (e.target === overlay) closeModal(overlay.id);
      });
    });
  }

  /* ---------- Init ---------- */
  document.addEventListener('DOMContentLoaded', async ()=>{
    renderCategorySelect();
    renderCategoryLegend();
    renderPaymentsList();
    wireEvents();
    await loadHistory();
  });

})();
