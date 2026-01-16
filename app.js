document.addEventListener('DOMContentLoaded', () => {
  const rangeEl = document.getElementById('range');
  const statusEl = document.getElementById('status');
  const fetchedEl = document.getElementById('fetched-at');
  const refreshBtn = document.getElementById('refresh');
  const COOL_DOWN_MINUTES = 10;
  const COOL_DOWN = COOL_DOWN_MINUTES * 60 * 1000;
  const MAX_DAYS = 15;
  const HOURS = ['10:00', '11:00', '12:00', '13:00', '14:00', '15:00'];
  const BOOKING_PAGES = [
    { id: 923258, label: '区民外', tbodyId: 'slots-body-out' },
    { id: 625571, label: '区内（豊島区民）', tbodyId: 'slots-body-in' },
  ];
  const API_BASE = '/wp-json/onthe6ks/v1/kidspark/slots';
  const tableBodies = new Map(
    BOOKING_PAGES.map((p) => [p.id, document.getElementById(p.tbodyId)])
  );
  let lastFetchedMs = 0;

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

  const renderStatus = (text, isError = false) => {
    statusEl.textContent = text;
    statusEl.className = isError ? 'muted error' : 'muted';
  };

  const formatApiDate = (s) => {
    if (!s || s.length < 8) return '-';
    return `${s.slice(0, 4)}/${pad(s.slice(4, 6))}/${pad(s.slice(6, 8))}`;
  };

  const parseTimestamp = (value) => {
    if (!value) return null;
    const tryParse = (v) => {
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? null : d;
    };

    // 例: 2024-05-21T12:00:00+0900 形式のときに +09:00 を補う
    if (typeof value === 'string' && value.match(/\+\d{4}$/)) {
      const fixed = value.replace(/(\+\d{2})(\d{2})$/, '$1:$2');
      const parsed = tryParse(fixed);
      if (parsed) return parsed;
    }
    return tryParse(value);
  };

  const formatJst = (dateObj) => {
    if (!dateObj) return '-';
    const opts = {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    };
    return dateObj.toLocaleString('ja-JP', opts).replace(/\//g, '/').replace(',', '');
  };

  const parseDateString = (s) => {
    if (!s) return null;
    // 2026-01-17 or 20260117 をどちらも許容
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const d = new Date(s);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    if (s.length >= 8) {
      const normalized = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
      const d = new Date(normalized);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    return null;
  };

  const setPlaceholder = (pageId, text) => {
    const target = tableBodies.get(pageId);
    if (target) {
      target.innerHTML = `<tr><td class="date">-</td><td colspan="6" class="muted">${text}</td></tr>`;
    }
  };

  const groupSlots = (slots) => {
    const grouped = {};
    (slots || []).forEach((s) => {
      if (!s?.date || !s?.start_time) return;
      if (!grouped[s.date]) grouped[s.date] = {};
      grouped[s.date][s.start_time] = s;
    });
    return grouped;
  };

  const renderTable = (pageId, grouped) => {
    const target = tableBodies.get(pageId);
    if (!target) return;

    const bookingUrl = (date, time) =>
      `https://coubic.com/toshima-kidspark/${pageId}/book?selected_date=${date}&selected_slot=${time}`;

    const rows = Object.keys(grouped)
      .sort()
      .map((iso) => {
        const slots = grouped[iso];
        const parsed = parseDateString(iso);
        const displayDate = parsed ? formatDateLabel(parsed) : iso;
        const cells = HOURS.map((h) => {
          const slot = slots[h];
          if (!slot) return '<td><span class="tag none">枠なし</span></td>';
          if (slot.vacancy === 0) return '<td><span class="tag full">満席</span></td>';
          const level = slot.vacancy <= 5 ? 'danger' : '';
          const tag = `<span class="tag ${level}">残${slot.vacancy}</span>`;
          return `<td><a class="slot-link" href="${bookingUrl(slot.date, slot.start_time)}" target="_blank" rel="noopener">${tag}</a></td>`;
        });
        return `<tr><td class="date">${displayDate}</td>${cells.join('')}</tr>`;
      });

    if (!rows.length) {
      target.innerHTML = '<tr><td class="date">-</td><td colspan="6" class="muted">取得できる枠がありませんでした。</td></tr>';
      return;
    }
    target.innerHTML = rows.join('');
  };

  const buildApiUrl = (pageId) =>
    `${API_BASE}?days=${MAX_DAYS}&booking_page=${pageId}`;

  const fetchPage = async (pageId) => {
    const res = await fetch(buildApiUrl(pageId), { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`page ${pageId} HTTP ${res.status}`);
    const json = await res.json();
    return { pageId, json };
  };

  const fetchSlots = async () => {
    fetchedEl.textContent = '｜ 取得時刻: -';
    renderStatus('取得中...');
    BOOKING_PAGES.forEach((p) => setPlaceholder(p.id, '取得中...'));

    const results = await Promise.allSettled(BOOKING_PAGES.map((p) => fetchPage(p.id)));
    let anySuccess = false;
    let rangeText = '';
    let latestFetchedMs = 0;

    results.forEach((result, idx) => {
      const { id } = BOOKING_PAGES[idx];
      if (result.status === 'fulfilled') {
        const { json } = result.value;
        const grouped = groupSlots(json.data);
        renderTable(id, grouped);
        anySuccess = true;

        if (!rangeText && json.range?.start && json.range?.end) {
          rangeText = `対象期間: ${formatApiDate(json.range.start)} 〜 ${formatApiDate(json.range.end)}（1時間枠・残り枠）`;
        }
        if (json.fetched_at) {
          const ts = new Date(json.fetched_at).getTime();
          if (!Number.isNaN(ts)) {
            latestFetchedMs = Math.max(latestFetchedMs, ts);
          }
        }
      } else {
        console.error(result.reason);
        setPlaceholder(id, '取得に失敗しました。時間をおいて再度お試しください。');
      }
    });

    if (anySuccess) {
      if (!rangeText) {
        const start = new Date();
        const end = new Date();
        end.setDate(start.getDate() + (MAX_DAYS - 1));
        rangeText = `対象期間: ${start.getFullYear()}/${start.getMonth() + 1}/${start.getDate()} 〜 ${end.getFullYear()}/${end.getMonth() + 1}/${end.getDate()}（1時間枠・残り枠）`;
      }
      rangeEl.textContent = rangeText;

      const fetchedAt = latestFetchedMs ? new Date(latestFetchedMs) : null;
      const fallback = fetchedAt || parseTimestamp(Date.now());
      fetchedEl.textContent = `｜ 取得時刻: ${formatJst(fallback)}`;
      lastFetchedMs = fallback ? fallback.getTime() : 0;
      const isPartialError = results.some((r) => r.status === 'rejected');
      renderStatus(isPartialError ? '一部の取得に失敗しました' : '更新しました', isPartialError);
    } else {
      renderStatus('取得に失敗しました', true);
      fetchedEl.textContent = '｜ 取得時刻: -';
    }
  };

  refreshBtn.addEventListener('click', () => {
    const now = Date.now();
    if (lastFetchedMs && now - lastFetchedMs < COOL_DOWN) {
      const remain = Math.ceil((COOL_DOWN - (now - lastFetchedMs)) / 60000);
      renderStatus(`直近取得から${COOL_DOWN_MINUTES}分は再取得を待ちます。あと${remain}分で再取得できます。`);
      return;
    }
    fetchSlots();
  });

  // 初回ロード時に自動取得
  fetchSlots();
});
