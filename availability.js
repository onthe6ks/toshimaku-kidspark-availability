(() => {
  const rangeEl = document.getElementById('range');
  const statusEl = document.getElementById('status');
  const tbody = document.getElementById('slots-body');
  const refreshBtn = document.getElementById('refresh');

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
          return `<td><span class="tag ${level}">残${slot.vacancy}</span></td>`;
        });
        return `<tr><td class="date">${formatDateLabel(date)}</td>${cells.join('')}</tr>`;
      });

    if (!rows.length) {
      tbody.innerHTML = '<tr><td class="date">-</td><td colspan="6" class="muted">取得できる枠がありませんでした。</td></tr>';
      return;
    }
    tbody.innerHTML = rows.join('');
  };

  const fetchSlots = async () => {
    const { start, end } = buildRange();
    rangeEl.textContent = `対象期間: ${start.getFullYear()}/${start.getMonth() + 1}/${start.getDate()} 〜 ${end.getFullYear()}/${end.getMonth() + 1}/${end.getDate()}（1時間枠・残り枠）`;
    renderStatus('取得中...');

    const url = `https://coubic.com/api/v2/merchants/toshima-kidspark/booking_pages/923258/time_slots?start=${toApiDate(start)}&end=${toApiDate(end, true)}`;
    try {
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const grouped = {};
      (json.data || []).forEach((s) => {
        if (!grouped[s.date]) grouped[s.date] = {};
        grouped[s.date][s.start_time] = s;
      });
      renderTable(grouped);
      renderStatus('更新しました');
    } catch (err) {
      console.error(err);
      renderStatus('取得に失敗しました', true);
      tbody.innerHTML = '<tr><td class="date">-</td><td colspan="6" class="muted">取得エラー</td></tr>';
    }
  };

  refreshBtn.addEventListener('click', fetchSlots);
})();
