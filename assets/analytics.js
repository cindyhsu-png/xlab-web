/* 墨宇官網共用埋點 — nova / nschool / xlab / ai-xplore 四站同一份
 *
 * 為什麼要有這支：
 *   nschool-web v3.4 與 09-02 兩輪改版、ai-xplore 兩天六版，每一版都是為了提高轉換，
 *   但四站都沒有埋點 —— 好看與有效永遠分不開。這支是要讓「改版有沒有效」變成可回答的問題。
 *
 * 設計原則：
 *   ・純附加。不改任何現有程式碼，全部走事件委派。
 *   ・沒設 GA ID 也能用 —— 事件會進 window.__mojiEvents，開 console 就驗得到。
 *   ・尊重 Do Not Track。
 *
 * 用法：<script defer src="assets/analytics.js"></script> 放在 </body> 前。
 */
(function () {
  'use strict';

  // ── 設定 ───────────────────────────────────────────────────────────
  // 🔴 去 Google Analytics 開一個 GA4 資源，把評估 ID（G- 開頭）貼在這裡。
  //    四站可以共用同一個 ID —— GA4 會用 page_location 的網域自動分開。
  //    沒填也不會壞：事件照樣記進 window.__mojiEvents，只是不送出去。
  var GA_ID = '';

  var DNT = navigator.doNotTrack === '1' || window.doNotTrack === '1';
  var buf = (window.__mojiEvents = []);

  function send(name, params) {
    var e = Object.assign({ _t: new Date().toISOString(), _e: name }, params || {});
    buf.push(e);
    if (buf.length > 500) buf.shift(); // 不要無限長大
    if (window.gtag) window.gtag('event', name, params || {});
  }
  window.mojiTrack = send; // 頁面裡想自己補事件時可以用

  // ── 載入 GA4 ───────────────────────────────────────────────────────
  if (GA_ID && !DNT) {
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', GA_ID, { send_page_view: true });
  }

  var ready = function (fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  };

  ready(function () {
    // ── ① 捲動深度 ───────────────────────────────────────────────────
    // 只回報「最深到過哪」，每一階只報一次。
    var marks = [25, 50, 75, 100], hit = {}, ticking = false;
    function scrollDepth() {
      var h = document.documentElement;
      var max = h.scrollHeight - h.clientHeight;
      if (max <= 0) return;
      var pct = Math.round(((window.scrollY || h.scrollTop) / max) * 100);
      marks.forEach(function (m) {
        if (pct >= m && !hit[m]) { hit[m] = 1; send('scroll_depth', { percent: m }); }
      });
    }
    addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () { scrollDepth(); ticking = false; });
    }, { passive: true });
    scrollDepth();

    // ── ② 區塊曝光 ───────────────────────────────────────────────────
    // 哪些區塊真的被看到 —— 這是「模組區的有幾成看得到」的答案。
    if ('IntersectionObserver' in window) {
      var seen = {};
      var io = new IntersectionObserver(function (rows) {
        rows.forEach(function (r) {
          var id = r.target.id;
          if (!r.isIntersecting || !id || seen[id]) return;
          seen[id] = 1;
          send('section_view', { section: id });
        });
      }, { threshold: 0.35 });
      document.querySelectorAll('section[id]').forEach(function (el) { io.observe(el); });
    }

    // ── ③ 連結與 CTA ─────────────────────────────────────────────────
    document.addEventListener('click', function (ev) {
      var a = ev.target.closest && ev.target.closest('a[href]');
      if (!a) return;
      var href = a.getAttribute('href') || '';
      if (href.charAt(0) === '#' || href.indexOf('javascript:') === 0) return;
      var outbound = false;
      try { outbound = new URL(href, location.href).host !== location.host; } catch (e) {}
      send(outbound ? 'outbound_click' : 'internal_click', {
        link_url: href,
        link_text: (a.textContent || '').trim().slice(0, 60)
      });
    }, true);

    // ── ④ ai-xplore 專屬：模組選購 ───────────────────────────────────
    // 這一段是別的地方拿不到的資料 —— 哪些模組被選最多，直接回饋定價與包裝。
    // 走事件委派，不動原本的 toggle()／paint() 一個字。
    // MODULES 是頁內 script 的 top-level const —— 那種綁定進得了全域語彙環境，
    // 但**不會**掛到 window 上。所以要用 typeof 探，不能寫 window.MODULES。
    var mods = (typeof MODULES !== 'undefined') ? MODULES : window.MODULES;
    if (document.getElementById('mods')) {
      var nameOf = function (i) {
        return (mods && mods[i] && mods[i].n) || ('#' + i);
      };
      var priceOf = function (i) {
        return (mods && mods[i] && mods[i].price) || 0;
      };
      var cartTotal = function () {
        var p = window.__aixPicked;
        if (!p) return null;
        var sum = 0; p.forEach(function (i) { sum += priceOf(i); });
        return { count: p.size, value: sum };
      };

      document.addEventListener('click', function (ev) {
        var t = ev.target;
        if (!t.closest) return;

        var pick = t.closest('[data-pick]');
        if (pick) {
          var i = +pick.dataset.pick;
          // 這一刻還沒 toggle，所以「現在有沒有」就是「等一下會不會被移除」
          var wasOn = window.__aixPicked && window.__aixPicked.has(i);
          setTimeout(function () {
            var c = cartTotal();
            send(wasOn ? 'module_deselect' : 'module_select', {
              module_name: nameOf(i),
              module_index: i,
              price: priceOf(i),
              cart_count: c && c.count,
              cart_value: c && c.value
            });
          }, 0);
          return;
        }

        var drop = t.closest('[data-drop]');
        if (drop) {
          var j = +drop.dataset.drop;
          setTimeout(function () {
            var c = cartTotal();
            send('module_remove', {
              module_name: nameOf(j), module_index: j,
              cart_count: c && c.count, cart_value: c && c.value
            });
          }, 0);
          return;
        }

        if (t.closest('#cartClear')) {
          var before = cartTotal();
          send('cart_clear', { cart_count: before && before.count, cart_value: before && before.value });
          return;
        }

        var chip = t.closest('#filters [data-k], #filters .chip');
        if (chip) {
          send('module_filter', {
            category: chip.dataset.k || (chip.textContent || '').trim().slice(0, 24)
          });
        }
      }, true);

      // 離開頁面時把最終選購狀態送一次 —— 這是最接近「意向」的訊號。
      addEventListener('pagehide', function () {
        var c = cartTotal();
        if (c && c.count > 0) send('cart_final', { cart_count: c.count, cart_value: c.value });
      });
    }

    // ── ⑤ 停留時間 ───────────────────────────────────────────────────
    var t0 = Date.now();
    addEventListener('pagehide', function () {
      send('engagement', { seconds: Math.round((Date.now() - t0) / 1000) });
    });
  });
})();
