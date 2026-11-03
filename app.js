(() => {
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const STORAGE_KEY = 'vibebank-demo-state-v1';
  const initialState = { balance: 0, cardNumber: '4829017600041337', transactions: [], cardFrozen: false, dailyLimit: 1000, balanceHidden: false, savings: { name: 'Накопительная цель', target: 1000, saved: 0 }, enabledFeatures: { cards: true, payments: true, analytics: true }, scheduledPayments: [], extraCards: [], pinCode: '1337', onlinePayments: true, contactlessPayments: true, moneyRequests: [] };
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
    $('#mobile-balance').textContent = state.balanceHidden ? '••••••' : euros(state.balance);
    $('#mobile-mini-balance').textContent = state.balanceHidden ? '••••' : euros(state.balance);
    $('#mobile-card-number').textContent = `••••  ••••  ••••  ${state.cardNumber.slice(-4)}`;
    $('#daily-limit').value = state.dailyLimit;
    $('#online-payments').checked = state.onlinePayments !== false;
    $('#contactless-payments').checked = state.contactlessPayments !== false;
    $('#extra-cards').innerHTML = state.extraCards.map((card, index) => `<div class="extra-card-row"><span>•••• ${escapeHtml(card.last4)} · Виртуальная</span><button type="button" data-freeze-card="${index}">${card.frozen ? 'Разблокировать' : 'Заморозить'}</button></div>`).join('');
    $('#scheduled-list').innerHTML = state.scheduledPayments.map((payment, index) => `<div class="scheduled-row"><span><strong>${escapeHtml(payment.name)}</strong><small>${escapeHtml(payment.date)}</small></span><b>${euros(payment.amount)}</b><button type="button" data-cancel-schedule="${index}" aria-label="Отменить платёж">×</button></div>`).join('');
    $('#scheduled-empty').classList.toggle('hidden', state.scheduledPayments.length > 0);
    $$('[data-feature]').forEach((input) => { input.checked = state.enabledFeatures?.[input.dataset.feature] !== false; });
    $$('[data-view="cards"], #cards-view').forEach((node) => node.classList.toggle('hidden', state.enabledFeatures?.cards === false));
    $$('[data-view="payments"]').forEach((node) => node.classList.toggle('hidden', state.enabledFeatures?.payments === false));
    $$('[data-view="analytics"], #analytics-view').forEach((node) => node.classList.toggle('hidden', state.enabledFeatures?.analytics === false));
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
    $$('.mobile-nav button').forEach((button) => button.classList.toggle('active', button.dataset.view === view || (['send', 'iban', 'other'].includes(view) && button.dataset.view === 'payments')));
    if (view === 'dashboard') render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function configureTransfer() {
    const methods = {
      card: ['↗', 'ПЕРЕВОД НА КАРТУ', 'Отправить деньги', 'Номер карты получателя', '0000 0000 0000 0000', 'numeric', '▤', '16 цифр'],
      iban: ['⇄', 'БАНКОВСКИЙ ПЕРЕВОД', 'Платёж за IBAN', 'IBAN получателя', 'DE89 3704 0044 0532 0130 00', 'text', '⌗', 'IBAN'],
      mobile: ['⌕', 'ОПЛАТА УСЛУГ', 'Мобильная связь', 'Номер телефона', '+49 151 23456789', 'tel', '☎', 'Телефон'],
      utilities: ['⌂', 'ОПЛАТА УСЛУГ', 'Коммунальный платёж', 'Номер лицевого счёта', 'Номер счёта', 'text', '⌂', 'Лицевой счёт'],
      internet: ['⌁', 'ОПЛАТА УСЛУГ', 'Оплата интернета', 'Номер договора или аккаунт', 'Номер договора', 'text', '⌁', 'Аккаунт'],
      subscription: ['◷', 'ОПЛАТА УСЛУГ', 'Оплата подписки', 'Название сервиса', 'Например, Music Plus', 'text', '◷', 'Сервис'],
      qr: ['▦', 'ДЕМО-ПЛАТЁЖ', 'Оплата по коду', 'Код платежа', 'Введи тестовый код', 'text', '▦', 'Код']
    };
    const data = methods[transferType] || methods.card;
    $('#transfer-icon').textContent = data[0]; $('#transfer-eyebrow').textContent = data[1]; $('#transfer-title').textContent = data[2];
    $('#recipient-label').textContent = data[3]; $('#recipient-input').placeholder = data[4]; $('#recipient-input').inputMode = data[5];
    $('#recipient-control .input-symbol').textContent = data[6]; $('#recipient-control .field-suffix').textContent = data[7];
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
      if (pin === state.pinCode) setTimeout(showBank, 140);
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
    const paymentButton = event.target.closest('[data-payment-type]');
    if (paymentButton) { event.preventDefault(); transferType = paymentButton.dataset.paymentType; $$('.view').forEach((view) => view.classList.toggle('hidden', view.id !== 'transfer-view')); $('#transfer-view').classList.remove('hidden'); $$('.nav-link,.mobile-nav button').forEach((item) => item.classList.toggle('active', item.dataset.view === 'payments')); configureTransfer(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    const cardToggle = event.target.closest('[data-freeze-card]');
    if (cardToggle) { const card = state.extraCards[Number(cardToggle.dataset.freezeCard)]; if (card) card.frozen = !card.frozen; save(); render(); showToast(card?.frozen ? 'Виртуальная карта заморожена.' : 'Виртуальная карта активна.'); return; }
    const cancelSchedule = event.target.closest('[data-cancel-schedule]');
    if (cancelSchedule) { state.scheduledPayments.splice(Number(cancelSchedule.dataset.cancelSchedule), 1); save(); render(); showToast('Запланированный платёж отменён.'); return; }
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
    let recipientValid = recipient.length >= 3; let recipientMessage = 'Проверь введённые данные.';
    if (transferType === 'card') { recipientValid = digits.length === 16; recipientMessage = 'Введите корректный номер карты.'; }
    else if (transferType === 'iban') { recipientValid = /^[A-Z]{2}[A-Z0-9]{13,32}$/.test(recipient.replace(/\s/g, '')); recipientMessage = 'Введите корректный IBAN.'; }
    else if (transferType === 'mobile') { recipientValid = /^[+\d][\d\s()\-]{7,18}$/.test(recipient); recipientMessage = 'Введите корректный номер телефона.'; }
    $('#recipient-error').textContent = recipientValid ? '' : recipientMessage;
    $('#amount-error').textContent = Number.isFinite(amount) && amount > 0 ? '' : 'Введите сумму больше нуля.';
    $('#transfer-error').textContent = '';
    if (!recipientValid || !Number.isFinite(amount) || amount <= 0) return;
    if (!state.onlinePayments && ['subscription', 'qr'].includes(transferType)) { $('#transfer-error').textContent = 'Интернет-платежи отключены в настройках карты.'; return; }
    if (state.cardFrozen) { $('#transfer-error').textContent = 'Карта заблокирована. Разблокируй её в разделе «Карты».'; return; }
    if (amount > state.dailyLimit) { $('#transfer-error').textContent = `Превышен дневной лимит ${euros(state.dailyLimit)}.`; return; }
    if (amount > state.balance) { $('#transfer-error').textContent = 'Недостаточно баланса.'; return; }
    state.balance = Math.round((state.balance - amount) * 100) / 100;
    const target = transferType === 'card' ? `•••• ${digits.slice(-4)}` : transferType === 'iban' ? `IBAN ${recipient.replace(/\s/g, '').slice(0, 4)}…${recipient.replace(/\s/g, '').slice(-4)}` : recipient;
    const title = ['card', 'iban'].includes(transferType) ? `Перевод · ${target}` : `${$('#transfer-title').textContent} · ${target}`;
    makeTransaction(transferType, amount, title);
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
  $('#create-card').addEventListener('click', () => { const last4 = String(Math.floor(1000 + Math.random() * 9000)); state.extraCards.push({ last4, frozen: false }); save(); render(); showToast(`Виртуальная карта •••• ${last4} выпущена.`); });
  $('#online-payments').addEventListener('change', (event) => { state.onlinePayments = event.target.checked; save(); showToast(`Интернет-покупки ${state.onlinePayments ? 'включены' : 'отключены'}.`); });
  $('#contactless-payments').addEventListener('change', (event) => { state.contactlessPayments = event.target.checked; save(); showToast(`Бесконтактная оплата ${state.contactlessPayments ? 'включена' : 'отключена'}.`); });
  $('#change-pin').addEventListener('click', () => { const next = window.prompt('Новый PIN-код должен содержать 4 цифры:'); if (next === null) return; if (!/^\d{4}$/.test(next)) return showToast('PIN должен состоять ровно из 4 цифр.', true); state.pinCode = next; save(); showToast('Демо-PIN изменён.'); });
  $('#limit-form').addEventListener('submit', (event) => { event.preventDefault(); const limit = Number($('#daily-limit').value); if (!Number.isFinite(limit) || limit <= 0) return showToast('Укажи лимит больше нуля.', true); state.dailyLimit = limit; save(); showToast('Дневной лимит сохранён.'); });
  $('#schedule-form').addEventListener('submit', (event) => { event.preventDefault(); const name = $('#schedule-name').value.trim(); const amount = Number($('#schedule-amount').value); const date = $('#schedule-date').value; if (!name || !date || !Number.isFinite(amount) || amount <= 0) return showToast('Заполни название, сумму и дату.', true); state.scheduledPayments.push({ name, amount, date }); save(); render(); event.target.reset(); showToast('Демо-платёж добавлен в расписание.'); });
  $('#request-money').addEventListener('click', () => { const ref = Math.random().toString(36).slice(2, 8).toUpperCase(); state.moneyRequests.unshift({ ref, date: new Date().toLocaleString('ru-RU') }); save(); showToast(`Демо-запрос создан · код ${ref}`); });
  $('#mobile-inbox').addEventListener('click', () => { const recent = state.transactions.slice(0, 3).map((tx) => tx.title).join(' · '); showToast(recent ? `Последние операции: ${recent}` : 'Пока нет новых операций.'); });
  $('#mobile-rewards').addEventListener('click', () => { const points = state.transactions.filter((tx) => tx.kind !== 'topup').length * 10; showToast(`Демо-бонусы: ${points} баллов · начисляем 10 за расходную операцию.`); });
  $('#mobile-pet').addEventListener('click', () => $('#profile-toggle').click());
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
