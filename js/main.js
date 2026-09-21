/* ============================================================
   Nitish Kumar Yadav — Portfolio interactions
   Vanilla JS, no dependencies.
   ============================================================ */
(function () {
  'use strict';

  var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };

  /* ---------- Theme toggle ---------- */
  var themeToggle = $('#themeToggle');
  var root = document.documentElement;

  function applyTheme(theme) {
    root.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }

  if (themeToggle) {
    themeToggle.addEventListener('click', function () {
      applyTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    });
  }

  /* ---------- Mobile nav ---------- */
  var navToggle = $('#navToggle');
  var navMenu = $('#navMenu');

  function closeMenu() {
    if (!navMenu) return;
    navMenu.classList.remove('open');
    if (navToggle) {
      navToggle.setAttribute('aria-expanded', 'false');
      navToggle.setAttribute('aria-label', 'Open menu');
    }
  }

  if (navToggle && navMenu) {
    navToggle.addEventListener('click', function () {
      var open = navMenu.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', String(open));
      navToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    });

    // Close on link click (mobile) and on Escape
    $$('.nav-link', navMenu).forEach(function (link) {
      link.addEventListener('click', closeMenu);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && navMenu.classList.contains('open')) {
        closeMenu();
        if (navToggle) navToggle.focus();
      }
    });
    document.addEventListener('click', function (e) {
      if (!navMenu.classList.contains('open')) return;
      if (!navMenu.contains(e.target) && !navToggle.contains(e.target)) closeMenu();
    });
  }

  /* ---------- Navbar shadow on scroll ---------- */
  var navbar = $('.navbar');
  function onScrollNav() {
    if (navbar) navbar.classList.toggle('scrolled', window.scrollY > 8);
  }

  /* ---------- Scroll-reveal animations ---------- */
  var revealEls = $$('.reveal');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if ('IntersectionObserver' in window && !reduceMotion) {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
    revealEls.forEach(function (el) { revealObserver.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('visible'); });
  }

  /* ---------- Animated counters ---------- */
  function formatNumber(n) {
    return n.toLocaleString('en-US');
  }

  function animateCounter(el) {
    var target = parseInt(el.getAttribute('data-count'), 10) || 0;
    var suffix = el.getAttribute('data-suffix') || '';
    var duration = 1800;
    var start = null;

    if (reduceMotion) {
      el.textContent = formatNumber(target) + suffix;
      return;
    }

    function step(ts) {
      if (!start) start = ts;
      var progress = Math.min((ts - start) / duration, 1);
      // easeOutQuart for a satisfying deceleration
      var eased = 1 - Math.pow(1 - progress, 4);
      el.textContent = formatNumber(Math.round(target * eased)) + suffix;
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  var counters = $$('[data-count]');
  if ('IntersectionObserver' in window) {
    var counterObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          animateCounter(entry.target);
          counterObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.6 });
    counters.forEach(function (el) { counterObserver.observe(el); });
  } else {
    counters.forEach(function (el) {
      el.textContent = formatNumber(parseInt(el.getAttribute('data-count'), 10) || 0) + (el.getAttribute('data-suffix') || '');
    });
  }

  /* ---------- Active nav link highlighting ---------- */
  var sections = $$('main section[id]');
  var navLinks = $$('.nav-link');

  function highlightNav() {
    var scrollPos = window.scrollY + 140;
    var currentId = '';
    sections.forEach(function (sec) {
      if (sec.offsetTop <= scrollPos) currentId = sec.id;
    });
    navLinks.forEach(function (link) {
      var isActive = link.getAttribute('href') === '#' + currentId;
      link.classList.toggle('active', isActive);
      if (isActive) {
        link.setAttribute('aria-current', 'true');
      } else {
        link.removeAttribute('aria-current');
      }
    });
  }

  /* ---------- Smooth scroll (fallback for older browsers) ---------- */
  $$('a[href^="#"]').forEach(function (link) {
    link.addEventListener('click', function (e) {
      var id = link.getAttribute('href');
      if (id.length < 2) return;
      var target = $(id);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
      history.replaceState(null, '', id);
    });
  });

  var ticking = false;
  window.addEventListener('scroll', function () {
    if (!ticking) {
      window.requestAnimationFrame(function () {
        onScrollNav();
        highlightNav();
        ticking = false;
      });
      ticking = true;
    }
  }, { passive: true });
  onScrollNav();
  highlightNav();

  /* ---------- Contact form → own backend /api/contact ---------- */
  var form = $('#contactForm');
  var status = $('#formStatus');
  var submitBtn = $('#formSubmit');

  if (form && status) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();

      var get = function (id) { var el = $('#' + id, form); return el ? el.value.trim() : ''; };
      var payload = {
        name: get('name'),
        email: get('email'),
        message: get('message'),
        company: get('company') // honeypot — must stay empty
      };

      // Client-side checks (server validates again)
      if (payload.name.length < 2) return showFormStatus('Please enter your name.', 'err');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(payload.email)) return showFormStatus('Please enter a valid email address.', 'err');
      if (payload.message.length < 10) return showFormStatus('Message must be at least 10 characters.', 'err');

      var label = submitBtn ? submitBtn.querySelector('.btn-label') : null;
      var original = label ? label.textContent : '';
      if (submitBtn) submitBtn.disabled = true;
      if (label) label.textContent = 'Sending…';
      showFormStatus('', '');

      fetch(form.getAttribute('action') || '/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload)
      })
        .then(function (res) { return res.json().catch(function () { return {}; }).then(function (data) { return { ok: res.ok, data: data }; }); })
        .then(function (out) {
          if (out.ok && out.data.ok) {
            showFormStatus('Thanks! Your message has been sent — I\u2019ll get back to you soon.', 'ok');
            form.reset();
          } else {
            showFormStatus(out.data.error || 'Something went wrong. Please email me directly at lalyadvanitish6@gmail.com.', 'err');
          }
        })
        .catch(function () {
          showFormStatus('Network error — please email me directly at lalyadvanitish6@gmail.com.', 'err');
        })
        .finally(function () {
          if (submitBtn) submitBtn.disabled = false;
          if (label) label.textContent = original;
        });
    });
  }

  function showFormStatus(text, type) {
    status.textContent = text;
    status.className = type ? 'form-status ' + type : 'form-status';
  }

  /* ---------- Footer year ---------- */
  var yearEl = $('#year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());
})();
