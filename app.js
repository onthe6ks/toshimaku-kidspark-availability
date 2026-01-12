document.addEventListener('DOMContentLoaded', () => {
  const rangeEl = document.getElementById('range');
  const statusEl = document.getElementById('status');
  const fetchedEl = document.getElementById('fetched-at');
  const tbody = document.getElementById('slots-body');
  const refreshBtn = document.getElementById('refresh');
  let lastFetchedMs = 0;
  const COOL_DOWN = 30 * 60 * 1000; // 30分
  const API_URL = '/wp-json/onthe6ks/v1/kidspark/slots?days=15';

  const pad = (n) => String(n).padStart(2, '0');

  const formatDateLabel = (d) => {
    const w = ['日','月','火','水','木','金','土'];
    return `${d.getMonth() + 1}/${d.getDate()}(${w[d.getDay()]})`;
  };

  const toApiDate = (d, endOfDay = false) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}${m}${day}${endOfDay ? '2359' : '0000'}`;
  };

  const buildRange = () => {
    const start = new Date();
    const end = new Date();
    end.setDate(start.getDate() + 14); // 当日含め15日間
    return { start, end };
  };

  const renderStatus = (text, isError = false) => {
    statusEl.textContent = text;
    statusEl.className = isError ? 'muted error' : 'muted';
  };

  const renderTable = (grouped) => {
    const hours = ['10:00', '11:00', '12:00', '13:00', '14:00', '15:00'];
    const bookingUrl = (date, time) =>
      `https://coubic.com/toshima-kidspark/923258/book?selected_date=${date}&selected_slot=${time}`;
    const rows = Object.keys(grouped)
      .sort()
      .map((iso) => {
        const slots = grouped[iso];
        const date = new Date(iso);
        const cells = hours.map((h) => {
          const slot = slots[h];
          if (!slot) return '<td><span class="tag none">枠なし</span></td>';
          if (slot.vacancy === 0) return '<td><span class="tag full">満席</span></td>';
          const level = slot.vacancy <= 5 ? 'danger' : '';
          const tag = `<span class="tag ${level}">残${slot.vacancy}</span>`;
          return `<td><a class="slot-link" href="${bookingUrl(slot.date, slot.start_time)}" target="_blank" rel="noopener">${tag}</a></td>`;
        });
        return `<tr><td class="date">${formatDateLabel(date)}</td>${cells.join('')}</tr>`;
      });

    if (!rows.length) {
      tbody.innerHTML = '<tr><td class="date">-</td><td colspan="6" class="muted">取得できる枠がありませんでした。</td></tr>';
      return;
    }
    tbody.innerHTML = rows.join('');
  };

  const formatApiDate = (s) => {
    if (!s || s.length < 8) return '-';
    return `${s.slice(0, 4)}/${pad(s.slice(4, 6))}/${pad(s.slice(6, 8))}`;
  };

  const fetchSlots = async () => {
    fetchedEl.textContent = '｜ 取得時刻: -';
    renderStatus('取得中...');

    try {
      const res = await fetch(API_URL, { headers: { 'Accept': 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();

      // range表示（APIから取得できたら優先）
      if (json.range?.start && json.range?.end) {
        rangeEl.textContent = `対象期間: ${formatApiDate(json.range.start)} 〜 ${formatApiDate(json.range.end)}（1時間枠・残り枠）`;
      } else {
        const { start, end } = buildRange();
        rangeEl.textContent = `対象期間: ${start.getFullYear()}/${start.getMonth() + 1}/${start.getDate()} 〜 ${end.getFullYear()}/${end.getMonth() + 1}/${end.getDate()}（1時間枠・残り枠）`;
      }

      const grouped = {};
      (json.data || []).forEach((s) => {
        if (!grouped[s.date]) grouped[s.date] = {};
        grouped[s.date][s.start_time] = s;
      });
      renderTable(grouped);

      const fetchedAt = json.fetched_at ? new Date(json.fetched_at) : new Date();
      fetchedEl.textContent = `｜ 取得時刻: ${fetchedAt.getFullYear()}/${pad(fetchedAt.getMonth() + 1)}/${pad(fetchedAt.getDate())} ${pad(fetchedAt.getHours())}:${pad(fetchedAt.getMinutes())}`;
      lastFetchedMs = fetchedAt.getTime();
      renderStatus('更新しました');
    } catch (err) {
      console.error(err);
      renderStatus('取得に失敗しました', true);
      tbody.innerHTML = '<tr><td class="date">-</td><td colspan="6" class="muted">取得エラー</td></tr>';
    }
  };

  refreshBtn.addEventListener('click', () => {
    const now = Date.now();
    if (lastFetchedMs && now - lastFetchedMs < COOL_DOWN) {
      const remain = Math.ceil((COOL_DOWN - (now - lastFetchedMs)) / 60000);
      renderStatus(`直近取得から30分は再取得を待ちます。あと${remain}分で再取得できます。`);
      return;
    }
    fetchSlots();
  });

  // 初回ロード時に自動取得
  fetchSlots();
});
