(() => {
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const STORAGE_KEY = 'vibebank-demo-state-v1';
  const initialState = { balance: 0, cardNumber: '4829017600041337', transactions: [], cardFrozen: false, dailyLimit: 1000, balanceHidden: false, savings: { name: 'Накопительная цель', target: 1000, saved: 0 }, enabledFeatures: { cards: true, payments: true, analytics: true } };
  let state;
  try { state = { ...initialState, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') }; }
  catch { state = { ...initialState }; }
  let pin = '';
  let toastTimer;
  let transferType = 'card';
  let profile = { nickname: 'Мой аккаунт', theme: 'dark' };
  try { profile = { ...profile, ...JSON.parse(localStorage.getItem('vibebank-profile-v1') || '{}') }; } catch {}
  const applyProfile = () => {
    document.body.classList.toggle('light-theme', profile.theme === 'light');
    $('#profile-nickname').textContent = profile.nickname || 'Мой аккаунт';
    $('#nickname-input').value = profile.nickname || '';
    $('#theme-label').textContent = profile.theme === 'light' ? 'Тёмная тема' : 'Светлая тема';
  };

  const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  const euros = (value) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(value).replace(/\u00a0/g, ' ');
  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const formatCard = (digits) => digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim();

  function render() {
    $('#balance-value').textContent = euros(state.balance);
    $('#transfer-balance').textContent = euros(state.balance);
    $('#card-number').textContent = formatCard(state.cardNumber);
    $('#history-count').textContent = state.transactions.length;
    const list = $('#transaction-list');
    const empty = $('#empty-history');
    const query = ($('#history-search')?.value || '').toLowerCase(); const filter = $('#history-filter')?.value || 'all';
    const filtered = state.transactions.filter((tx) => (!query || `${tx.title} ${tx.amount} ${tx.date}`.toLowerCase().includes(query)) && (filter === 'all' || (filter === 'topup' ? tx.kind === 'topup' : tx.kind !== 'topup')));
    list.innerHTML = filtered.map((tx) => `<div class="transaction-row"><div class="transaction-icon">${tx.kind === 'topup' ? '＋' : tx.kind === 'iban' ? '⇄' : '↗'}</div><div class="transaction-info"><strong>${escapeHtml(tx.title)}</strong><small>${escapeHtml(tx.date)}</small></div><div class="transaction-amount ${tx.kind === 'topup' ? 'incoming' : 'outgoing'}">${tx.kind === 'topup' ? '+' : '−'}${euros(tx.amount)}</div></div>`).join('');
    empty.classList.toggle('hidden', filtered.length > 0);
    renderAdminTransactions();
    $('#large-card-number').textContent = formatCard(state.cardNumber);
    $('#card-status').textContent = state.cardFrozen ? 'Заблокирована' : 'Активна';
    $('#freeze-card').textContent = state.cardFrozen ? 'Разблокировать карту' : 'Временно заблокировать';
    $('#analytics-balance').textContent = euros(state.balance);
    $('#analytics-count').textContent = state.transactions.length;
    $('#analytics-spent').textContent = euros(state.transactions.filter((tx) => tx.kind !== 'topup').reduce((sum, tx) => sum + tx.amount, 0));
    $('#analytics-income').textContent = euros(state.transactions.filter((tx) => tx.kind === 'topup').reduce((sum, tx) => sum + tx.amount, 0));
    $('#goal-name').textContent = state.savings.name;
    $('#goal-current').textContent = `${euros(state.savings.saved)} накоплено`;
    $('#goal-target').textContent = `из ${euros(state.savings.target)}`;
    $('#goal-bar').style.width = `${Math.min(100, state.savings.saved / state.savings.target * 100)}%`;
    $('#balance-visibility').textContent = state.balanceHidden ? '◎' : '◉';
    $('#balance-visibility').setAttribute('aria-label', state.balanceHidden ? 'Показать баланс' : 'Скрыть баланс');
    $('#balance-value').textContent = state.balanceHidden ? '••••••' : euros(state.balance);
    $('#daily-limit').value = state.dailyLimit;
    $$('[data-feature]').forEach((input) => { input.checked = state.enabledFeatures?.[input.dataset.feature] !== false; });
    $$('.nav-link[data-view="cards"], #cards-view').forEach((node) => node.classList.toggle('hidden', state.enabledFeatures?.cards === false));
    $$('.nav-link[data-view="payments"]').forEach((node) => node.classList.toggle('hidden', state.enabledFeatures?.payments === false));
    $$('.nav-link[data-view="analytics"], #analytics-view').forEach((node) => node.classList.toggle('hidden', state.enabledFeatures?.analytics === false));
    fitBalanceAmount();
  }

  function fitBalanceAmount() {
    const amount = $('.balance-amount');
    const value = $('#balance-value');
    if (!amount || !value) return;
    value.style.fontSize = '';
    const base = parseFloat(getComputedStyle(value).fontSize);
    const available = amount.clientWidth - (amount.querySelector('.currency')?.offsetWidth || 0) - 8;
    if (value.scrollWidth > available) value.style.fontSize = `${Math.max(14, base * available / value.scrollWidth)}px`;
  }

  function renderAdminTransactions() {
    const root = $('#admin-transactions');
    $('#admin-empty').classList.toggle('hidden', state.transactions.length > 0);
    root.innerHTML = state.transactions.map((tx) => `<label class="admin-transaction"><input type="checkbox" value="${escapeHtml(tx.id)}"><span>${escapeHtml(tx.title)}</span><small>${euros(tx.amount)}</small></label>`).join('');
    $('#delete-selected').disabled = state.transactions.length === 0;
    $('#delete-selected').style.opacity = state.transactions.length === 0 ? '.48' : '1';
  }

  function showToast(message, isError = false) {
    const toast = $('#toast');
    $('#toast-message').textContent = message;
    toast.classList.toggle('error', isError);
    toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 3600);
  }

  function navigate(view) {
    $$('.view').forEach((section) => section.classList.add('hidden'));
    if (view === 'dashboard') $('#dashboard-view').classList.remove('hidden');
    else if (view === 'admin') $('#admin-view').classList.remove('hidden');
    else if (view === 'other') $('#other-view').classList.remove('hidden');
    else if (['cards', 'payments', 'analytics'].includes(view)) $(`#${view}-view`).classList.remove('hidden');
    else {
      transferType = view === 'iban' ? 'iban' : 'card';
      $('#transfer-view').classList.remove('hidden');
      configureTransfer();
    }
    $$('.nav-link').forEach((button) => button.classList.toggle('active', button.dataset.view === view || (['send', 'iban', 'other'].includes(view) && button.dataset.view === 'payments')));
    if (view === 'dashboard') render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function configureTransfer() {
    const iban = transferType === 'iban';
    $('#transfer-icon').textContent = iban ? '⇄' : '↗';
    $('#transfer-eyebrow').textContent = iban ? 'БАНКОВСКИЙ ПЕРЕВОД' : 'ПЕРЕВОД НА КАРТУ';
    $('#transfer-title').textContent = iban ? 'Платёж за IBAN' : 'Отправить деньги';
    $('#recipient-label').textContent = iban ? 'IBAN получателя' : 'Номер карты получателя';
    $('#recipient-input').placeholder = iban ? 'DE89 3704 0044 0532 0130 00' : '0000 0000 0000 0000';
    $('#recipient-input').inputMode = iban ? 'text' : 'numeric';
    $('#recipient-control .input-symbol').textContent = iban ? '⌗' : '▤';
    $('#recipient-control .field-suffix').textContent = iban ? 'IBAN' : '16 цифр';
    $('#recipient-input').value = '';
    $('#amount-input').value = '';
    $('#recipient-error').textContent = '';
    $('#amount-error').textContent = '';
    $('#transfer-error').textContent = '';
  }

  function makeTransaction(kind, amount, title) {
    state.transactions.unshift({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, kind, amount, title, date: new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date()) });
  }

  function showBank() {
    $('#login-screen').classList.add('hidden');
    $('#lock-screen').classList.add('hidden');
    $('#bank-screen').classList.remove('hidden');
    navigate('dashboard');
  }

  $('#keypad').addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    $('#pin-error').textContent = '';
    if (button.dataset.action === 'delete') pin = pin.slice(0, -1);
    else if (pin.length < 4) pin += button.dataset.digit;
    $$('#pin-dots span').forEach((dot, index) => dot.classList.toggle('filled', index < pin.length));
    $('#pin-dots').setAttribute('aria-label', `PIN-код: ${pin.length} цифр`);
    if (pin.length === 4) {
      if (pin === '1337') setTimeout(showBank, 140);
      else { $('#pin-error').textContent = 'Неверный PIN-код. Попробуй ещё раз.'; pin = ''; setTimeout(() => $$('#pin-dots span').forEach((dot) => dot.classList.remove('filled')), 180); $('#pin-dots').setAttribute('aria-label', 'PIN-код: 0 цифр'); }
    }
  });
  $('#login-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const username = $('#login-username').value.trim();
    const password = $('#login-password').value;
    if (username !== 'eliverlega' || password !== 'eliverlega') {
      $('#login-error').textContent = 'Неверный логин или пароль.';
      return;
    }
    $('#login-error').textContent = '';
    $('#login-screen').classList.add('hidden');
    $('#lock-screen').classList.remove('hidden');
    $('#login-form').reset();
  });
  document.addEventListener('keydown', (event) => {
    if ($('#lock-screen').classList.contains('hidden')) return;
    if (/^\d$/.test(event.key)) $(`#keypad [data-digit="${event.key}"]`)?.click();
    else if (event.key === 'Backspace') $('#keypad [data-action="delete"]').click();
  });

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-view]');
    if (button) { event.preventDefault(); navigate(button.dataset.view); }
  });

  $('#recipient-input').addEventListener('input', (event) => {
    if (transferType === 'card') {
      const digits = event.target.value.replace(/\D/g, '').slice(0, 16);
      event.target.value = formatCard(digits);
    } else event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9 ]/g, '').slice(0, 40);
  });

  $('#transfer-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const recipient = $('#recipient-input').value.trim();
    const digits = recipient.replace(/\D/g, '');
    const amount = Number($('#amount-input').value);
    const recipientValid = transferType === 'card' ? digits.length === 16 : /^[A-Z]{2}[A-Z0-9]{13,32}$/.test(recipient.replace(/\s/g, ''));
    $('#recipient-error').textContent = recipientValid ? '' : transferType === 'card' ? 'Введите корректный номер карты.' : 'Введите корректный IBAN.';
    $('#amount-error').textContent = Number.isFinite(amount) && amount > 0 ? '' : 'Введите сумму больше нуля.';
    $('#transfer-error').textContent = '';
    if (!recipientValid || !Number.isFinite(amount) || amount <= 0) return;
    if (state.cardFrozen) { $('#transfer-error').textContent = 'Карта заблокирована. Разблокируй её в разделе «Карты».'; return; }
    if (amount > state.dailyLimit) { $('#transfer-error').textContent = `Превышен дневной лимит ${euros(state.dailyLimit)}.`; return; }
    if (amount > state.balance) { $('#transfer-error').textContent = 'Недостаточно баланса.'; return; }
    state.balance = Math.round((state.balance - amount) * 100) / 100;
    const target = transferType === 'card' ? `•••• ${digits.slice(-4)}` : `IBAN ${recipient.replace(/\s/g, '').slice(0, 4)}…${recipient.replace(/\s/g, '').slice(-4)}`;
    makeTransaction(transferType, amount, `Перевод · ${target}`);
    save(); render(); navigate('dashboard');
    showToast('Успешная транзакция. Деньги отправлены.');
  });

  $('#topup-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const input = $('#topup-input'); const amount = Number(input.value);
    if (!input.value.trim() || !Number.isFinite(amount) || amount <= 0) { $('#topup-error').textContent = 'Ошибка. Введите пожалуйста сумму накрутки.'; return; }
    $('#topup-error').textContent = '';
    state.balance = Math.round((state.balance + amount) * 100) / 100;
    makeTransaction('topup', amount, 'Пополнение демо-баланса');
    save(); render(); input.value = ''; navigate('dashboard'); showToast('Успешная накрутка.');
  });

  $('#reduce-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const input = $('#reduce-input'); const amount = Number(input.value);
    if (!input.value.trim() || !Number.isFinite(amount) || amount < 0) { $('#reduce-error').textContent = 'Введите корректную сумму баланса.'; return; }
    $('#reduce-error').textContent = '';
    const previousBalance = state.balance;
    const difference = Math.abs(previousBalance - amount);
    state.balance = Math.round(amount * 100) / 100;
    if (difference > 0) makeTransaction(amount >= previousBalance ? 'topup' : 'card', difference, 'Установка точного баланса');
    save(); render(); input.value = ''; navigate('dashboard'); showToast('Баланс установлен.');
  });

  $('#card-input').addEventListener('input', (event) => { event.target.value = formatCard(event.target.value.replace(/\D/g, '').slice(0, 16)); });
  $('#card-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const digits = $('#card-input').value.replace(/\D/g, '');
    if (digits.length !== 16) { $('#card-error').textContent = 'Ошибка. Введи номер карты правильно.'; return; }
    $('#card-error').textContent = '';
    state.cardNumber = digits; save(); render(); $('#card-input').value = ''; navigate('dashboard'); showToast('Успешно изменён номер карты.');
  });

  $('#delete-selected').addEventListener('click', () => {
    const selected = new Set($$('#admin-transactions input:checked').map((input) => input.value));
    if (selected.size === 0) { showToast('Выбери операции, которые нужно удалить.', true); return; }
    state.transactions = state.transactions.filter((tx) => !selected.has(tx.id)); save(); render(); showToast('Выбранные операции удалены.');
  });
  $('#freeze-card').addEventListener('click', () => { state.cardFrozen = !state.cardFrozen; save(); render(); showToast(state.cardFrozen ? 'Демо-карта заблокирована.' : 'Демо-карта разблокирована.'); });
  $('#limit-form').addEventListener('submit', (event) => { event.preventDefault(); const limit = Number($('#daily-limit').value); if (!Number.isFinite(limit) || limit <= 0) return showToast('Укажи лимит больше нуля.', true); state.dailyLimit = limit; save(); showToast('Дневной лимит сохранён.'); });
  $('#schedule-payment').addEventListener('click', () => showToast('Регулярные платежи доступны только в режиме просмотра.', true));
  $('#history-search').addEventListener('input', render);
  $('#history-filter').addEventListener('change', render);
  $('#export-csv').addEventListener('click', () => {
    const rows = [['Дата', 'Операция', 'Сумма EUR'], ...state.transactions.map((tx) => [tx.date, tx.title, `${tx.kind === 'topup' ? '' : '-'}${tx.amount.toFixed(2)}`])];
    const csv = '\ufeff' + rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = 'vibebank-transactions.csv'; link.click(); URL.revokeObjectURL(url);
  });
  $('#balance-visibility').addEventListener('click', () => { state.balanceHidden = !state.balanceHidden; save(); render(); });
  $('#goal-form').addEventListener('submit', (event) => { event.preventDefault(); const name = $('#goal-input').value.trim(); const target = Number($('#goal-target-input').value); if (!name || !Number.isFinite(target) || target <= 0) return showToast('Введи название цели и сумму.', true); state.savings.name = name; state.savings.target = target; save(); render(); showToast('Накопительная цель сохранена.'); });
  $('#goal-save-form').addEventListener('submit', (event) => { event.preventDefault(); const amount = Number($('#goal-contribution').value); if (!Number.isFinite(amount) || amount <= 0 || amount > state.balance) return showToast('Проверь сумму и доступный баланс.', true); state.balance = Math.round((state.balance - amount) * 100) / 100; state.savings.saved = Math.round((state.savings.saved + amount) * 100) / 100; makeTransaction('card', amount, `В копилку · ${state.savings.name}`); save(); render(); $('#goal-contribution').value = ''; showToast('Деньги переведены в копилку.'); });
  $$('[data-feature]').forEach((input) => input.addEventListener('change', () => { state.enabledFeatures[input.dataset.feature] = input.checked; save(); render(); showToast(`Настройка «${input.closest('label').querySelector('span').textContent}» обновлена.`); }));
  $('#toast-close').addEventListener('click', () => $('#toast').classList.remove('visible'));
  $('#profile-toggle').addEventListener('click', () => {
    const open = $('#profile-menu').classList.toggle('hidden') === false;
    $('#profile-toggle').setAttribute('aria-expanded', String(open));
  });
  $('#save-nickname').addEventListener('click', () => {
    profile.nickname = $('#nickname-input').value.trim() || 'Мой аккаунт';
    localStorage.setItem('vibebank-profile-v1', JSON.stringify(profile)); applyProfile(); showToast('Ник сохранён.');
  });
  $('#nickname-input').addEventListener('keydown', (event) => { if (event.key === 'Enter') $('#save-nickname').click(); });
  $('#theme-toggle').addEventListener('click', () => {
    profile.theme = profile.theme === 'light' ? 'dark' : 'light';
    localStorage.setItem('vibebank-profile-v1', JSON.stringify(profile)); applyProfile();
  });
  $('#logout-button').addEventListener('click', () => {
    $('#bank-screen').classList.add('hidden'); $('#lock-screen').classList.remove('hidden');
    $('#lock-screen').classList.add('hidden'); $('#login-screen').classList.remove('hidden');
    $('#profile-menu').classList.add('hidden'); $('#profile-toggle').setAttribute('aria-expanded', 'false');
    pin = ''; $$('#pin-dots span').forEach((dot) => dot.classList.remove('filled'));
    $('#pin-dots').setAttribute('aria-label', 'PIN-код: 0 цифр'); window.scrollTo({ top: 0 });
  });
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.profile-area')) { $('#profile-menu').classList.add('hidden'); $('#profile-toggle').setAttribute('aria-expanded', 'false'); }
  });
  applyProfile();
  render();
  window.addEventListener('resize', fitBalanceAmount);
})();
