(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var rub = function (n) { return n.toLocaleString('ru-RU') + ' ₽'; };

  /* =====================================================================
     Hero: Scroll Scrub
     ===================================================================== */
  var SRC = window.matchMedia('(max-width: 900px)').matches ? 'hero-720.mp4' : 'hero-1080.mp4';
  var hero = $('#hero');
  var video = $('#heroVideo');
  var content = $('#heroContent');
  var finale = $('#heroFinale');
  var hint = $('#heroHint');
  var progressBar = $('#heroProgress');
  var loader = $('#loader');
  var loaderFill = $('#loaderFill');

  video.muted = true;

  // Скачиваем видео целиком в память: перемотка по blob идёт без сетевых запросов,
  // поэтому скраб не подтормаживает. При открытии через file:// fetch недоступен —
  // тогда отдаём файл напрямую с preload="auto".
  function loadFull() {
    return fetch(SRC, { credentials: 'same-origin', mode: 'cors' }).then(function (res) {
      if (!res.ok || !res.body) throw new Error('fetch failed');
      var total = +res.headers.get('Content-Length') || 0;
      var reader = res.body.getReader();
      var chunks = [], received = 0;
      function pump() {
        return reader.read().then(function (r) {
          if (r.done) return new Blob(chunks, { type: 'video/mp4' });
          chunks.push(r.value);
          received += r.value.length;
          if (total) loaderFill.style.transform = 'scaleX(' + received / total + ')';
          return pump();
        });
      }
      return pump();
    });
  }

  function ready() {
    loaderFill.style.transform = 'scaleX(1)';
    loader.classList.add('is-done');
    video.pause();
    startScrub();
  }

  loadFull().then(function (blob) {
    video.src = URL.createObjectURL(blob);
  }).catch(function () {
    video.src = SRC;
  }).then(function () {
    video.load();
    if (video.readyState >= 4) ready();
    else video.addEventListener('canplaythrough', ready, { once: true });
  });

  // iOS Safari не отрисовывает кадры при перемотке, пока видео ни разу не «запускали».
  // Делаем беззвучный play/pause при первом касании или прокрутке.
  var unlocked = false;
  function unlock() {
    if (unlocked) return;
    unlocked = true;
    var p = video.play();
    if (p && p.then) p.then(function () { video.pause(); seekTo(current); }).catch(function () {});
    else video.pause();
  }
  ['touchstart', 'pointerdown', 'wheel', 'keydown'].forEach(function (e) {
    window.addEventListener(e, unlock, { once: true, passive: true });
  });

  // Прогресс 0 — верх Hero у верха экрана (первый кадр),
  // 1 — низ Hero у низа экрана, сразу перед выходом из секции (последний кадр).
  var target = 0;   // куда указывает прокрутка (0..1)
  var current = 0;  // сглаженное значение, которое уже показано
  var running = false;
  var scrubReady = false;

  function readHero() {
    var rect = hero.getBoundingClientRect();
    var distance = rect.height - window.innerHeight;
    var p = distance > 0 ? -rect.top / distance : 0;
    target = Math.min(1, Math.max(0, p));
    if (scrubReady && !running) { running = true; requestAnimationFrame(tick); }
  }

  function seekTo(p) {
    var duration = video.duration;
    if (!duration || !isFinite(duration)) return;
    // Чуть раньше конца файла: точное значение duration в части браузеров даёт пустой кадр
    var t = p * Math.max(0, duration - 0.02);
    if (Math.abs(video.currentTime - t) > 0.001) video.currentTime = t;
  }

  function startScrub() {
    scrubReady = true;
    readHero();
    current = target;
    seekTo(current);
    paintHero();
  }

  function paintHero() {
    progressBar.style.transform = 'scaleX(' + current + ')';
    // Стартовый текст уходит в первые 20%, финальная фраза проявляется в последние 25%
    var fade = Math.max(0, 1 - current / 0.2);
    content.style.opacity = fade;
    content.style.transform = 'translateY(' + (1 - fade) * -40 + 'px)';
    content.style.visibility = fade === 0 ? 'hidden' : '';
    var fin = Math.min(1, Math.max(0, (current - 0.75) / 0.2));
    finale.style.opacity = fin;
    finale.style.transform = 'translateY(' + (1 - fin) * 30 + 'px)';
    hint.style.opacity = current > 0.02 ? 0 : 1;
  }

  function tick() {
    // Плавное догоняние: резкий рывок колесом не превращается в скачок через кадры
    current += (target - current) * 0.15;
    if (Math.abs(target - current) < 0.0005) current = target;

    // Пока браузер декодирует предыдущий кадр, новую перемотку не ставим в очередь
    if (!video.seeking) seekTo(current);
    paintHero();

    // Цикл крутится, пока видео не догонит прокрутку, затем засыпает до следующего scroll
    if (current !== target || video.seeking) requestAnimationFrame(tick);
    else running = false;
  }

  /* =====================================================================
     Шапка: прозрачная над видео, плотная ниже, прячется при прокрутке вниз
     ===================================================================== */
  var header = $('#header');
  var lastY = window.scrollY;

  function readHeader() {
    var y = window.scrollY;
    var heroEnd = hero.offsetTop + hero.offsetHeight - header.offsetHeight;
    header.classList.toggle('is-solid', y > heroEnd);
    header.classList.toggle('is-hidden', y > heroEnd + 200 && y > lastY && !document.body.classList.contains('is-locked'));
    lastY = y;
  }

  function onScroll() {
    readHero();
    readHeader();
    readParallax();
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  // Мобильные браузеры меняют высоту окна, когда прячут адресную строку
  if (window.visualViewport) window.visualViewport.addEventListener('resize', onScroll);

  /* =====================================================================
     Мобильное меню
     ===================================================================== */
  var menu = $('#mobileMenu');
  function setMenu(open) {
    menu.classList.toggle('is-open', open);
    menu.setAttribute('aria-hidden', String(!open));
    document.body.classList.toggle('is-locked', open);
  }
  $('#burger').addEventListener('click', function () { setMenu(true); });
  $('#menuClose').addEventListener('click', function () { setMenu(false); });
  $$('a', menu).forEach(function (a) { a.addEventListener('click', function () { setMenu(false); }); });

  /* =====================================================================
     Каталог
     ===================================================================== */
  // Ассортимент и цены — из брифа сайта (демо, требуют подтверждения перед запуском).
  // Фото — студийные снимки с Google Drive (Marketing L'Onglerie), фон доведён до белого,
  // квадрат 900×900, лежат в img/products/<id>.webp
  var PRODUCTS = [
    { id: 'nail-smoothing-base', cat: 'nails', title: 'Сглаживающая база', fr: 'La Base Lissante', vol: '15 мл', price: 1916, badge: 'В видео', tint: '#f3dfd2' },
    { id: 'nail-vitamin-base',   cat: 'nails', title: 'Витаминная база', fr: 'La Base Vitaminée', vol: '15 мл', price: 2192, tint: '#f4d7cf' },
    { id: 'nail-hardening-base', cat: 'nails', title: 'Основа для ногтей', fr: 'La Base Durcissante', vol: '15 мл', price: 1916, tint: '#f3e0c9' },
    { id: 'nail-strengthener',   cat: 'nails', title: 'Средство для укрепления ногтей', fr: 'L’Embellisseur', vol: '15 мл', price: 2192, tint: '#f1d5e0' },
    { id: 'nail-serum',          cat: 'nails', title: 'Сыворотка для ногтей', fr: 'Le Sérum', vol: '14 мл', price: 2192, tint: '#f4dcdc' },
    { id: 'nail-oil',            cat: 'nails', title: 'Питательное масло для ногтей', fr: 'L’Huile', vol: '14 мл', price: 2192, tint: '#f6dccb' },
    { id: 'nail-scrub',          cat: 'nails', title: 'Скраб для ногтей', fr: 'Le Gommage', vol: '14 мл', price: 1661, tint: '#efe3d6' },
    { id: 'nail-top',            cat: 'nails', title: 'Быстросохнущее покрытие', fr: 'Le Sèche Vernis', vol: '14 мл', price: 1661, tint: '#ecdde3' },
    { id: 'cuticle-butter',      cat: 'nails', title: 'Масло для ногтей и кутикулы', fr: 'Le Beurre Ongles & Cuticules', price: 2504, tint: '#f3d8e0' },
    { id: 'polish-remover',      cat: 'nails', title: 'Жидкость для снятия лака', fr: 'Le Dissolvant', vol: '100 мл', price: 1852, tint: '#f4e2db' },
    { id: 'hands-cream',         cat: 'hands', title: 'Крем для рук', fr: 'La Crème Mains', vol: '30 мл', price: 1236, tint: '#f3e0da' },
    { id: 'hands-balm',          cat: 'hands', title: 'Бальзам для рук', fr: 'Le Baume Mains', vol: '75 мл', price: 1661, tint: '#efe5d8' },
    { id: 'hands-serum',         cat: 'hands', title: 'Сыворотка для рук', fr: 'Le Sérum Mains', vol: '15 мл', price: 2847, tint: '#eee2dc' },
    { id: 'hands-scrub',         cat: 'hands', title: 'Скраб для рук', fr: 'Le Gommage Mains', vol: '150 мл', price: 2328, tint: '#f4e0d9' },
    { id: 'feet-balm',           cat: 'feet',  title: 'Бальзам для стоп', fr: 'Le Baume Pieds', vol: '75 мл', price: 1916, tint: '#ece2db' },
    { id: 'feet-scrub',          cat: 'feet',  title: 'Скраб для стоп', fr: 'Le Gommage Pieds', vol: '150 мл', price: 2600, tint: '#efe7dc' },
    { id: 'body-cream',          cat: 'body',  title: 'Крем для тела', fr: 'La Crème Corps', vol: '200 мл', price: 2600, tint: '#f2e6d9' },
    { id: 'body-shimmer',        cat: 'body',  title: 'Мерцающее масло-хайлайтер', fr: 'L’Eau Pailletée', price: 2672, tint: '#f1dfcf' }
  ];

  function photoHTML(p, lazy) {
    return '<img class="card__img" src="img/products/' + p.id + '.webp" width="900" height="900" alt="' +
      p.title + ' L’Onglerie ' + p.fr + '"' + (lazy ? ' loading="lazy"' : '') + ' decoding="async">';
  }

  var grid = $('#productGrid');
  grid.innerHTML = PRODUCTS.map(function (p, i) {
    return '<article class="card reveal" style="--d:' + (i % 4) * 0.08 + 's" data-cat="' + p.cat + '">' +
      '<div class="card__media" style="--tint:' + p.tint + '"><span class="card__glare"></span>' +
        (p.badge ? '<span class="card__badge">' + p.badge + '</span>' : '') +
        photoHTML(p, true) +
        '<button class="btn btn--primary card__add" data-add="' + p.id + '">В корзину</button>' +
        '<button class="card__mobile-add" data-add="' + p.id + '" aria-label="Добавить «' + p.title + '» в корзину">+</button>' +
      '</div>' +
      '<div class="card__body">' +
        '<div><h3 class="card__title">' + p.title + '</h3><p class="card__desc">' + p.fr + (p.vol ? ' · ' + p.vol : '') + '</p></div>' +
        '<div class="card__price">' + rub(p.price) + '</div>' +
      '</div>' +
    '</article>';
  }).join('');

  // Фильтры
  $$('.chip').forEach(function (chip) {
    chip.addEventListener('click', function () {
      $$('.chip').forEach(function (c) { c.classList.toggle('is-active', c === chip); });
      var f = chip.getAttribute('data-filter');
      $$('.card', grid).forEach(function (card, i) {
        var show = f === 'all' || card.getAttribute('data-cat') === f;
        card.classList.toggle('is-hidden', !show);
        if (show && !reduceMotion) {
          card.animate([{ opacity: 0, transform: 'translateY(20px)' }, { opacity: 1, transform: 'none' }],
            { duration: 500, delay: i * 40, easing: 'cubic-bezier(.22,.7,.2,1)', fill: 'backwards' });
        }
      });
    });
  });

  /* =====================================================================
     Корзина
     ===================================================================== */
  var FREE_SHIP = 3000;
  var cart = {};
  try { cart = JSON.parse(localStorage.getItem('naile-cart') || '{}') || {}; } catch (e) { cart = {}; }

  var drawer = $('#drawer');
  var overlay = $('#overlay');
  var countEl = $('#cartCount');

  function byId(id) { for (var i = 0; i < PRODUCTS.length; i++) if (PRODUCTS[i].id === id) return PRODUCTS[i]; }

  function saveCart() {
    try { localStorage.setItem('naile-cart', JSON.stringify(cart)); } catch (e) {}
  }

  function renderCart() {
    var ids = Object.keys(cart).filter(function (id) { return byId(id) && cart[id] > 0; });
    var count = 0, total = 0;
    ids.forEach(function (id) { count += cart[id]; total += cart[id] * byId(id).price; });

    countEl.textContent = count;
    countEl.classList.toggle('has-items', count > 0);

    $('#cartItems').innerHTML = ids.length ? ids.map(function (id) {
      var p = byId(id);
      return '<div class="line-item">' +
        '<div class="line-item__thumb" style="--tint:' + p.tint + '">' + photoHTML(p) + '</div>' +
        '<div><div class="line-item__title">' + p.title + '</div><div class="line-item__price">' + rub(p.price) + '</div>' +
          '<div class="qty"><button data-dec="' + id + '" aria-label="Меньше">−</button><span>' + cart[id] + '</span><button data-inc="' + id + '" aria-label="Больше">+</button></div></div>' +
        '<button class="line-item__remove" data-remove="' + id + '">Удалить</button>' +
      '</div>';
    }).join('') : '<div class="drawer__empty">Корзина пока пуста.<br>Начните с разглаживающей базы — это наш хит.</div>';

    var left = FREE_SHIP - total;
    $('#freeShip').innerHTML = (left > 0 ? 'До бесплатной доставки осталось <b>' + rub(left) + '</b>' : 'Доставка бесплатная 🎉') +
      '<div class="free-ship__bar"><i style="transform:scaleX(' + Math.min(1, total / FREE_SHIP) + ')"></i></div>';
    $('#cartTotal').textContent = rub(total);
    $('#checkoutBtn').disabled = count === 0;
  }

  function setDrawer(open) {
    drawer.classList.toggle('is-open', open);
    overlay.classList.toggle('is-open', open);
    drawer.setAttribute('aria-hidden', String(!open));
    document.body.classList.toggle('is-locked', open);
  }

  // Точка «летит» от кнопки к иконке корзины
  function flyToCart(from) {
    if (reduceMotion) return;
    var a = from.getBoundingClientRect();
    var b = $('#cartBtn').getBoundingClientRect();
    var dot = document.createElement('div');
    dot.className = 'fly';
    document.body.appendChild(dot);
    var x0 = a.left + a.width / 2 - 11, y0 = a.top + a.height / 2 - 11;
    var x1 = b.left + b.width / 2 - 11, y1 = b.top + b.height / 2 - 11;
    dot.animate([
      { transform: 'translate(' + x0 + 'px,' + y0 + 'px) scale(1)' },
      { transform: 'translate(' + (x0 + x1) / 2 + 'px,' + (Math.min(y0, y1) - 120) + 'px) scale(1.2)', offset: .5 },
      { transform: 'translate(' + x1 + 'px,' + y1 + 'px) scale(.4)', opacity: .6 }
    ], { duration: 700, easing: 'cubic-bezier(.5,0,.3,1)' }).onfinish = function () {
      dot.remove();
      countEl.classList.remove('bump'); void countEl.offsetWidth; countEl.classList.add('bump');
    };
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-add],[data-inc],[data-dec],[data-remove]');
    if (!t) return;
    var id;
    if ((id = t.getAttribute('data-add'))) {
      cart[id] = (cart[id] || 0) + 1;
      // Шапка могла спрятаться — показываем, чтобы точке было куда лететь
      header.classList.remove('is-hidden');
      flyToCart(t);
      toast('«' + byId(id).title + '» в корзине');
    } else if ((id = t.getAttribute('data-inc'))) cart[id]++;
    else if ((id = t.getAttribute('data-dec'))) { cart[id]--; if (cart[id] <= 0) delete cart[id]; }
    else if ((id = t.getAttribute('data-remove'))) delete cart[id];
    saveCart();
    renderCart();
  });

  $('#cartBtn').addEventListener('click', function () { setDrawer(true); });
  $('#drawerClose').addEventListener('click', function () { setDrawer(false); });
  overlay.addEventListener('click', function () { setDrawer(false); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { setDrawer(false); setMenu(false); }
  });
  $('#checkoutBtn').addEventListener('click', function () {
    toast('Оформление заказа будет подключено к платёжной системе');
  });

  renderCart();

  /* =====================================================================
     Уведомление
     ===================================================================== */
  var toastEl = $('#toast'), toastTimer;
  function toast(text) {
    toastEl.textContent = text;
    toastEl.classList.add('is-shown');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-shown'); }, 2400);
  }

  /* =====================================================================
     Заголовки: разбиваем на слова, чтобы они выезжали по очереди
     ===================================================================== */
  var wordIndex;
  function splitWords(node) {
    Array.prototype.slice.call(node.childNodes).forEach(function (child) {
      if (child.nodeType === 3) {
        var frag = document.createDocumentFragment();
        child.textContent.split(/(\s+)/).forEach(function (part) {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
          var w = document.createElement('span');
          w.className = 'w';
          var i = document.createElement('i');
          i.style.setProperty('--wi', wordIndex++);
          i.textContent = part;
          w.appendChild(i);
          frag.appendChild(w);
        });
        node.replaceChild(frag, child);
      } else if (child.nodeType === 1) {
        splitWords(child);
      }
    });
  }
  if (!reduceMotion) {
    $$('.h2').forEach(function (h) {
      wordIndex = 0;
      h.setAttribute('aria-label', h.textContent);
      splitWords(h);
      $$('.w', h).forEach(function (w) { w.setAttribute('aria-hidden', 'true'); });
      // Заголовок вне .reveal анимируем сам по себе
      if (!h.closest('.reveal')) h.classList.add('reveal-solo');
    });
  }

  /* =====================================================================
     Появление блоков и счётчики
     ===================================================================== */
  function countUp(el) {
    var end = +el.getAttribute('data-count');
    var pre = el.getAttribute('data-prefix') || '', suf = el.getAttribute('data-suffix') || '';
    if (reduceMotion) { el.textContent = pre + end.toLocaleString('ru-RU') + suf; return; }
    var t0 = performance.now(), dur = 1600;
    (function step(now) {
      var k = Math.min(1, (now - t0) / dur);
      var eased = 1 - Math.pow(1 - k, 3);
      el.textContent = pre + Math.round(end * eased).toLocaleString('ru-RU') + suf;
      if (k < 1) requestAnimationFrame(step);
    })(t0);
  }

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add('is-in');
        var num = en.target.querySelector('[data-count]');
        if (num) countUp(num);
        io.unobserve(en.target);
      });
    }, { threshold: .15, rootMargin: '0px 0px -40px 0px' });
    $$('.reveal:not(.reveal--clip), .reveal-solo').forEach(function (el) { io.observe(el); });

    // Элемент со «шторкой» скрыт через clip-path, и браузер считает его невидимым —
    // поэтому следим за его родителем
    var clipIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        $$('.reveal--clip', en.target).forEach(function (el) { el.classList.add('is-in'); });
        clipIO.unobserve(en.target);
      });
    }, { threshold: .15 });
    $$('.reveal--clip').forEach(function (el) { clipIO.observe(el.parentElement); });
  } else {
    $$('.reveal').forEach(function (el) { el.classList.add('is-in'); });
    $$('[data-count]').forEach(countUp);
  }

  /* =====================================================================
     Ритуал: картинка слева меняется вместе с активным шагом
     ===================================================================== */
  var steps = $$('.step');
  var stepImgs = $$('.ritual__visual img');
  var counter = $('#ritualCounter');
  if ('IntersectionObserver' in window) {
    var stepIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var i = steps.indexOf(en.target);
        steps.forEach(function (s, j) { s.classList.toggle('is-active', j === i); });
        stepImgs.forEach(function (img, j) { img.classList.toggle('is-active', j === i); });
        counter.textContent = '0' + (i + 1) + ' / 0' + steps.length;
      });
    }, { rootMargin: '-45% 0px -45% 0px' });
    steps.forEach(function (s) { stepIO.observe(s); });
  }

  /* =====================================================================
     Многослойный параллакс при прокрутке
     data-speed — слой сдвигается относительно центра экрана (минус — медленнее, плюс — быстрее)
     data-parallax — фото внутри рамки
     ===================================================================== */
  var parallax = $$('[data-parallax]');
  var speedLayers = $$('[data-speed]');
  var galleryRows = $$('.gallery-row');
  var galleryBox = $('#galleryRows');
  var layersQueued = false;

  function readParallax() {
    if (reduceMotion || layersQueued) return;
    layersQueued = true;
    requestAnimationFrame(paintLayers);
  }

  function paintLayers() {
    layersQueued = false;
    var vh = window.innerHeight;

    parallax.forEach(function (img) {
      var r = img.parentElement.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh) return;
      var k = (r.top + r.height / 2 - vh / 2) / vh;
      img.style.translate = '0 ' + (-8 - k * 8) + '%';
    });

    speedLayers.forEach(function (el) {
      var host = el.offsetParent || el.parentElement;
      var r = host.getBoundingClientRect();
      if (r.bottom < -200 || r.top > vh + 200) return;
      var offset = (r.top + r.height / 2) - vh / 2;
      el.style.translate = '0 ' + (offset * -parseFloat(el.getAttribute('data-speed'))).toFixed(1) + 'px';
    });

    // Ленты галереи едут навстречу друг другу
    if (galleryBox) {
      var g = galleryBox.getBoundingClientRect();
      if (g.bottom > 0 && g.top < vh) {
        var p = (vh - g.top) / (vh + g.height); // 0..1 пока блок на экране
        galleryRows.forEach(function (row) {
          var dir = +row.getAttribute('data-dir');
          var span = Math.max(0, row.scrollWidth - galleryBox.clientWidth);
          var x = dir < 0 ? -p * span : -(1 - p) * span;
          row.style.transform = 'translate3d(' + x.toFixed(1) + 'px,0,0)';
        });
      }
    }
  }

  /* =====================================================================
     Глубина за курсором: в [data-tilt-scope] слои с data-depth
     смещаются на разное расстояние — получается объём
     ===================================================================== */
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  if (finePointer && !reduceMotion) {
    $$('[data-tilt-scope]').forEach(function (scope) {
      var layers = $$('[data-depth]', scope);
      scope.addEventListener('pointermove', function (e) {
        var r = scope.getBoundingClientRect();
        var x = (e.clientX - r.left) / r.width - 0.5;
        var y = (e.clientY - r.top) / r.height - 0.5;
        layers.forEach(function (l) {
          var d = +l.getAttribute('data-depth');
          l.style.translate = (x * d).toFixed(1) + 'px ' + (y * d).toFixed(1) + 'px';
        });
      });
      scope.addEventListener('pointerleave', function () {
        layers.forEach(function (l) { l.style.translate = ''; });
      });
    });

    // Карточки товаров наклоняются к курсору, флакон и блик двигаются отдельными слоями
    $$('.card__media').forEach(function (media) {
      media.addEventListener('pointermove', function (e) {
        var r = media.getBoundingClientRect();
        media.style.setProperty('--mx', ((e.clientX - r.left) / r.width - 0.5).toFixed(3));
        media.style.setProperty('--my', ((e.clientY - r.top) / r.height - 0.5).toFixed(3));
      });
      media.addEventListener('pointerleave', function () {
        media.style.setProperty('--mx', 0);
        media.style.setProperty('--my', 0);
      });
    });

    // Магнитные кнопки слегка тянутся к курсору
    $$('.btn--primary:not(.card__add), .btn--light, .btn--ghost, .round-btn').forEach(function (btn) {
      btn.setAttribute('data-magnetic', '');
      btn.addEventListener('pointermove', function (e) {
        var r = btn.getBoundingClientRect();
        var x = (e.clientX - r.left - r.width / 2) * 0.25;
        var y = (e.clientY - r.top - r.height / 2) * 0.35;
        btn.style.translate = x.toFixed(1) + 'px ' + y.toFixed(1) + 'px';
      });
      btn.addEventListener('pointerleave', function () { btn.style.translate = ''; });
    });
  }

  /* =====================================================================
     Слайдер отзывов
     ===================================================================== */
  var slider = $('#reviewSlider');
  var prev = $('#prevReview'), next = $('#nextReview');
  function slideBy(dir) {
    var card = slider.firstElementChild;
    var step = card.getBoundingClientRect().width + 20;
    slider.scrollBy({ left: dir * step, behavior: reduceMotion ? 'auto' : 'smooth' });
  }
  function updateArrows() {
    prev.disabled = slider.scrollLeft < 4;
    next.disabled = slider.scrollLeft + slider.clientWidth > slider.scrollWidth - 4;
  }
  prev.addEventListener('click', function () { slideBy(-1); });
  next.addEventListener('click', function () { slideBy(1); });
  slider.addEventListener('scroll', updateArrows, { passive: true });
  updateArrows();

  /* =====================================================================
     FAQ: плавное раскрытие
     ===================================================================== */
  $$('.faq-item').forEach(function (item) {
    var summary = item.querySelector('summary');
    var body = item.querySelector('.faq-item__body');
    summary.addEventListener('click', function (e) {
      if (reduceMotion || !body.animate) return;
      e.preventDefault();
      if (item.open) {
        var h = body.offsetHeight;
        body.animate([{ height: h + 'px' }, { height: '0px' }], { duration: 350, easing: 'cubic-bezier(.22,.7,.2,1)' })
          .onfinish = function () { item.open = false; };
      } else {
        item.open = true;
        var full = body.offsetHeight;
        body.animate([{ height: '0px' }, { height: full + 'px' }], { duration: 400, easing: 'cubic-bezier(.22,.7,.2,1)' });
      }
    });
  });

  /* =====================================================================
     Подписка (пока без отправки на сервер)
     ===================================================================== */
  $('#subscribeForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var input = this.querySelector('input');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value.trim())) {
      toast('Проверьте адрес e-mail');
      input.focus();
      return;
    }
    input.value = '';
    toast('Готово! Промокод на −15% уже летит к вам на почту');
  });

  onScroll();
})();
