(() => {
  'use strict';

  const GEO_URL = 'https://geocoding-api.open-meteo.com/v1/search';
  const WX_URL = 'https://api.open-meteo.com/v1/forecast';
  const DEFAULT_PLACE = { name: 'Mumbai', admin: 'Maharashtra', country: 'India', lat: 19.076, lon: 72.8777 };

  const $ = (sel) => document.querySelector(sel);
  const els = {
    form: $('#search-form'),
    input: $('#q'),
    list: $('#suggestions'),
    status: $('#status'),
    main: $('#main'),
    current: $('#current'),
    hourly: $('#hourly'),
    daily: $('#daily'),
    locate: $('#locate'),
    unitBtns: document.querySelectorAll('[data-unit]'),
  };

  /* ---------- storage ---------- */
  const store = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* ignore */ } },
  };

  function savedPlace() {
    try {
      const p = JSON.parse(store.get('wv-place'));
      if (p && Number.isFinite(p.lat) && Number.isFinite(p.lon)) return p;
    } catch { /* ignore */ }
    return DEFAULT_PLACE;
  }

  const state = {
    place: savedPlace(),
    units: store.get('wv-units') === 'imperial' ? 'imperial' : 'metric',
  };

  /* ---------- weather codes (WMO) ---------- */
  const WMO = {
    0: ['Clear sky', 'clear'], 1: ['Mainly clear', 'clear'], 2: ['Partly cloudy', 'partly'], 3: ['Overcast', 'cloud'],
    45: ['Fog', 'fog'], 48: ['Rime fog', 'fog'],
    51: ['Light drizzle', 'drizzle'], 53: ['Drizzle', 'drizzle'], 55: ['Heavy drizzle', 'drizzle'],
    56: ['Freezing drizzle', 'drizzle'], 57: ['Freezing drizzle', 'drizzle'],
    61: ['Light rain', 'rain'], 63: ['Rain', 'rain'], 65: ['Heavy rain', 'rain'],
    66: ['Freezing rain', 'rain'], 67: ['Freezing rain', 'rain'],
    71: ['Light snow', 'snow'], 73: ['Snow', 'snow'], 75: ['Heavy snow', 'snow'], 77: ['Snow grains', 'snow'],
    80: ['Light showers', 'rain'], 81: ['Rain showers', 'rain'], 82: ['Violent showers', 'rain'],
    85: ['Snow showers', 'snow'], 86: ['Heavy snow showers', 'snow'],
    95: ['Thunderstorm', 'storm'], 96: ['Thunderstorm with hail', 'storm'], 99: ['Thunderstorm with heavy hail', 'storm'],
  };

  function describe(code) {
    const [label, kind] = WMO[code] || ['Unknown', 'cloud'];
    return { label, kind };
  }

  function skyClass(kind, isDay) {
    if (kind === 'clear' || kind === 'partly') return isDay ? 'day' : 'night';
    if (kind === 'drizzle') return 'rain';
    return kind;
  }

  /* ---------- icons (inline SVG, stroke-based) ---------- */
  const CLOUD = 'M15 35h19a8 8 0 0 0 1-15.9A11 11 0 0 0 14 22.5 6.8 6.8 0 0 0 15 35z';
  const MOON = 'M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z';
  let uid = 0;

  const rays = (cx, cy, r1, r2) =>
    Array.from({ length: 8 }, (_, i) => {
      const a = (i * Math.PI) / 4, c = Math.cos(a), s = Math.sin(a);
      return `M${(cx + c * r1).toFixed(1)} ${(cy + s * r1).toFixed(1)}L${(cx + c * r2).toFixed(1)} ${(cy + s * r2).toFixed(1)}`;
    }).join('');

  const sunShape = (cx, cy, r) =>
    `<g class="sun"><circle cx="${cx}" cy="${cy}" r="${r}"/><path d="${rays(cx, cy, r + 4, r + 8)}"/></g>`;

  const moonShape = (x, y, s) =>
    `<g class="sun" transform="translate(${x} ${y}) scale(${s})"><path stroke-width="${(2.2 / s).toFixed(2)}" d="${MOON}"/></g>`;

  const cloudShape = (y = 0) => `<path d="${CLOUD}" transform="translate(0 ${y})"/>`;

  function icon(kind, isDay = 1) {
    const svg = (body) =>
      `<svg viewBox="0 0 48 48" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

    switch (kind) {
      case 'clear':
        return svg(isDay ? sunShape(24, 24, 8) : moonShape(6, 6, 1.5));
      case 'partly': {
        const id = `m${++uid}`;
        const cloudT = 'translate(6 5) scale(.9)';
        const mask = `<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="48" height="48"><rect width="48" height="48" fill="#fff"/><path d="${CLOUD}" transform="${cloudT}" fill="#000" stroke="#000" stroke-width="7"/></mask>`;
        const body = isDay ? sunShape(16, 16, 5) : moonShape(3, 3, 1);
        return svg(`${mask}<g mask="url(#${id})">${body}</g><path d="${CLOUD}" transform="${cloudT}"/>`);
      }
      case 'drizzle':
        return svg(`${cloudShape(-6)}<path d="M17 37v2M25 37v2M33 37v2M21 41v2M29 41v2"/>`);
      case 'rain':
        return svg(`${cloudShape(-6)}<path d="M17 36l-2 6M25 36l-2 6M33 36l-2 6"/>`);
      case 'snow':
        return svg(`${cloudShape(-6)}<path stroke-width="3.4" d="M17 37h.01M25 37h.01M33 37h.01M21 42h.01M29 42h.01"/>`);
      case 'storm':
        return svg(`${cloudShape(-6)}<path d="M26 28l-6 8h7l-4 8"/>`);
      case 'fog':
        return svg(`${cloudShape(-9)}<path d="M10 31h28M14 37h22M10 43h28"/>`);
      default:
        return svg(cloudShape(1));
    }
  }

  /* ---------- formatting ---------- */
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const deg = (n) => `${Math.round(n)}°`;
  const parts = (iso) => ({ y: +iso.slice(0, 4), mo: +iso.slice(5, 7), d: +iso.slice(8, 10), h: +iso.slice(11, 13), mi: +iso.slice(14, 16) });
  const dateObj = (iso) => { const p = parts(iso); return new Date(p.y, p.mo - 1, p.d); };
  const clock = (iso) => { const { h, mi } = parts(iso); return `${h % 12 || 12}:${String(mi).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
  const hourLabel = (iso) => { const { h } = parts(iso); return `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`; };
  const compass = (d) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(d / 45) % 8];
  const windUnit = () => (state.units === 'metric' ? 'km/h' : 'mph');

  function uvLabel(uv) {
    if (uv < 3) return 'Low';
    if (uv < 6) return 'Moderate';
    if (uv < 8) return 'High';
    if (uv < 11) return 'Very high';
    return 'Extreme';
  }

  function placeSubtitle(place) {
    const bits = [place.admin, place.country].filter(Boolean);
    return bits.length ? bits.join(', ') : `${place.lat.toFixed(2)}, ${place.lon.toFixed(2)}`;
  }

  /* ---------- API ---------- */
  async function getJSON(url, signal) {
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    return res.json();
  }

  async function searchPlaces(q, signal) {
    const url = `${GEO_URL}?name=${encodeURIComponent(q)}&count=6&language=en&format=json`;
    const data = await getJSON(url, signal);
    return (data.results || []).map((r) => ({
      name: r.name, admin: r.admin1 || '', country: r.country || '', lat: r.latitude, lon: r.longitude,
    }));
  }

  let wxController;

  async function loadWeather() {
    wxController?.abort();
    wxController = new AbortController();
    const { place, units } = state;
    const params = new URLSearchParams({
      latitude: place.lat,
      longitude: place.lon,
      current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,surface_pressure,wind_speed_10m,wind_direction_10m',
      hourly: 'temperature_2m,weather_code,precipitation_probability,is_day',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,uv_index_max',
      timezone: 'auto',
      forecast_days: '7',
      temperature_unit: units === 'metric' ? 'celsius' : 'fahrenheit',
      wind_speed_unit: units === 'metric' ? 'kmh' : 'mph',
    });

    els.main.setAttribute('aria-busy', 'true');
    setStatus('Loading forecast…');
    try {
      const data = await getJSON(`${WX_URL}?${params}`, wxController.signal);
      render(data);
      setStatus('');
    } catch (err) {
      if (err.name === 'AbortError') return;
      setStatus('Could not load the forecast. Check your connection and try again.', true);
    } finally {
      if (!wxController.signal.aborted) els.main.setAttribute('aria-busy', 'false');
    }
  }

  /* ---------- rendering ---------- */
  function render(data) {
    const { current: cur, hourly: hr, daily: dy } = data;
    const now = describe(cur.weather_code);
    const sky = skyClass(now.kind, cur.is_day);

    const localDate = dateObj(cur.time).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });

    els.current.innerHTML = `
      <div class="hero sky-${sky}">
        <div class="hero-top">
          <div>
            <p class="place">${esc(state.place.name)}</p>
            <p class="sub">${esc(placeSubtitle(state.place))} · ${localDate}, ${clock(cur.time)}</p>
          </div>
          <div class="hero-icon">${icon(now.kind, cur.is_day)}</div>
        </div>
        <div class="hero-temp">
          <span class="temp">${Math.round(cur.temperature_2m)}°</span>
          <span class="unit">${state.units === 'metric' ? 'C' : 'F'}</span>
        </div>
        <p class="cond">${esc(now.label)}</p>
        <p class="hilo">H ${deg(dy.temperature_2m_max[0])} · L ${deg(dy.temperature_2m_min[0])} · Feels like ${deg(cur.apparent_temperature)}</p>
      </div>
      <dl class="stats">
        <div class="stat"><dt>Humidity</dt><dd>${Math.round(cur.relative_humidity_2m)}%</dd></div>
        <div class="stat"><dt>Wind</dt><dd>${Math.round(cur.wind_speed_10m)} ${windUnit()}<small>from ${compass(cur.wind_direction_10m)}</small></dd></div>
        <div class="stat"><dt>Pressure</dt><dd>${Math.round(cur.surface_pressure)} hPa</dd></div>
        <div class="stat"><dt>UV index</dt><dd>${Math.round(dy.uv_index_max[0])}<small>${uvLabel(dy.uv_index_max[0])} today</small></dd></div>
        <div class="stat"><dt>Rain chance</dt><dd>${Math.round(dy.precipitation_probability_max[0] ?? 0)}%<small>today</small></dd></div>
        <div class="stat"><dt>Sun</dt><dd>${clock(dy.sunrise[0])}<small>sets ${clock(dy.sunset[0])}</small></dd></div>
      </dl>`;

    // Hourly: next 24 hours starting from the current hour (times are local to the place).
    const startKey = `${cur.time.slice(0, 13)}:00`;
    let start = hr.time.findIndex((t) => t >= startKey);
    if (start < 0) start = 0;
    const hours = [];
    for (let i = start; i < Math.min(start + 24, hr.time.length); i++) {
      const w = describe(hr.weather_code[i]);
      const pop = hr.precipitation_probability[i];
      hours.push(`
        <li class="${i === start ? 'now' : ''}">
          <span class="t">${i === start ? 'Now' : hourLabel(hr.time[i])}</span>
          <span class="ico" title="${esc(w.label)}">${icon(w.kind, hr.is_day[i])}</span>
          <span class="v">${deg(hr.temperature_2m[i])}</span>
          <span class="p">${pop >= 10 ? `${Math.round(pop)}%` : ''}</span>
        </li>`);
    }
    els.hourly.innerHTML = hours.join('');
    els.hourly.scrollLeft = 0;

    // Daily: range bars share one scale across the week.
    const weekMin = Math.min(...dy.temperature_2m_min);
    const weekMax = Math.max(...dy.temperature_2m_max);
    const span = Math.max(weekMax - weekMin, 1);
    els.daily.innerHTML = dy.time.map((day, i) => {
      const w = describe(dy.weather_code[i]);
      const lo = dy.temperature_2m_min[i];
      const hi = dy.temperature_2m_max[i];
      const left = ((lo - weekMin) / span) * 100;
      const width = Math.max(((hi - lo) / span) * 100, 4);
      const label = i === 0 ? 'Today' : dateObj(day).toLocaleDateString('en-US', { weekday: 'short' });
      const pop = dy.precipitation_probability_max[i];
      return `
        <li>
          <span class="d">${label}</span>
          <span class="ico" title="${esc(w.label)}">${icon(w.kind, 1)}</span>
          <span class="p">${pop >= 10 ? `${Math.round(pop)}%` : ''}</span>
          <span class="lo">${deg(lo)}</span>
          <span class="track" role="img" aria-label="Low ${deg(lo)}, high ${deg(hi)}"><span class="fill" style="left:${left.toFixed(1)}%;width:${width.toFixed(1)}%"></span></span>
          <span class="hi">${deg(hi)}</span>
        </li>`;
    }).join('');
  }

  function setStatus(msg, isError = false) {
    els.status.textContent = msg;
    els.status.classList.toggle('error', isError);
  }

  /* ---------- place selection ---------- */
  function selectPlace(place) {
    state.place = place;
    store.set('wv-place', JSON.stringify(place));
    els.input.value = '';
    hideList();
    loadWeather();
  }

  /* ---------- search ---------- */
  let timer;
  let searchController;
  let results = [];

  function showList(items) {
    if (!items.length) {
      els.list.innerHTML = '<li class="empty">No matching places</li>';
    } else {
      els.list.innerHTML = items.map((p, i) => `
        <li><button type="button" data-i="${i}"><span>${esc(p.name)}</span><span class="meta">${esc([p.admin, p.country].filter(Boolean).join(', '))}</span></button></li>`).join('');
    }
    els.list.hidden = false;
  }

  function hideList() {
    els.list.hidden = true;
    els.list.innerHTML = '';
  }

  async function runSearch(q) {
    searchController?.abort();
    searchController = new AbortController();
    try {
      results = await searchPlaces(q, searchController.signal);
      showList(results);
    } catch (err) {
      if (err.name !== 'AbortError') setStatus('Search failed. Check your connection.', true);
    }
    return results;
  }

  els.input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = els.input.value.trim();
    if (q.length < 2) { searchController?.abort(); results = []; hideList(); return; }
    timer = setTimeout(() => runSearch(q), 250);
  });

  els.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearTimeout(timer);
    const q = els.input.value.trim();
    if (!q) return;
    const found = await runSearch(q);
    if (found.length) selectPlace(found[0]);
  });

  els.list.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-i]');
    if (btn) selectPlace(results[+btn.dataset.i]);
  });

  // Arrow-key navigation between the input and the suggestions.
  els.input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      const first = els.list.querySelector('button');
      if (first) { e.preventDefault(); first.focus(); }
    } else if (e.key === 'Escape') {
      hideList();
    }
  });

  els.list.addEventListener('keydown', (e) => {
    const buttons = [...els.list.querySelectorAll('button')];
    const i = buttons.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); buttons[Math.min(i + 1, buttons.length - 1)]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); (i <= 0 ? els.input : buttons[i - 1]).focus(); }
    else if (e.key === 'Escape') { hideList(); els.input.focus(); }
  });

  document.addEventListener('click', (e) => {
    if (!els.form.contains(e.target)) hideList();
  });

  /* ---------- units + location ---------- */
  function syncUnitButtons() {
    els.unitBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.unit === state.units)));
  }

  els.unitBtns.forEach((b) => b.addEventListener('click', () => {
    if (state.units === b.dataset.unit) return;
    state.units = b.dataset.unit;
    store.set('wv-units', state.units);
    syncUnitButtons();
    loadWeather();
  }));

  els.locate.addEventListener('click', () => {
    if (!navigator.geolocation) {
      setStatus('This browser does not support location.', true);
      return;
    }
    setStatus('Finding your location…');
    navigator.geolocation.getCurrentPosition(
      (pos) => selectPlace({ name: 'My location', admin: '', country: '', lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => setStatus('Could not get your location. Allow access, or search for a city.', true),
      { timeout: 10000 }
    );
  });

  /* ---------- start ---------- */
  syncUnitButtons();
  loadWeather();
})();
