(function () {
  'use strict';

  var tabButtons = document.querySelectorAll('.tab-btn');
  var panels = document.querySelectorAll('.scenario-panel');
  var darkToggle = document.getElementById('darkToggle');
  var iconMoon = document.getElementById('iconMoon');
  var iconSun = document.getElementById('iconSun');

  var STORAGE_KEY_THEME = 'nexus-theme';
  var STORAGE_KEY_TAB = 'nexus-active-tab';

  function activateTab(target) {
    tabButtons.forEach(function (btn) {
      btn.classList.toggle('active-tab', btn.dataset.tab === target);
    });
    panels.forEach(function (panel) {
      panel.classList.toggle('active', panel.id === target);
    });
    try {
      window.localStorage.setItem(STORAGE_KEY_TAB, target);
    } catch (err) {
      /* stockage local indisponible, on ignore silencieusement */
    }
  }

  tabButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      activateTab(btn.dataset.tab);
    });
  });

  function applyTheme(isDark) {
    document.documentElement.classList.toggle('dark', isDark);
    iconMoon.classList.toggle('hidden', isDark);
    iconSun.classList.toggle('hidden', !isDark);
    try {
      window.localStorage.setItem(STORAGE_KEY_THEME, isDark ? 'dark' : 'light');
    } catch (err) {
      /* stockage local indisponible, on ignore silencieusement */
    }
  }

  darkToggle.addEventListener('click', function () {
    var isCurrentlyDark = document.documentElement.classList.contains('dark');
    applyTheme(!isCurrentlyDark);
  });

  function init() {
    var savedTheme = null;
    var savedTab = null;
    try {
      savedTheme = window.localStorage.getItem(STORAGE_KEY_THEME);
      savedTab = window.localStorage.getItem(STORAGE_KEY_TAB);
    } catch (err) {
      savedTheme = null;
      savedTab = null;
    }

    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    var shouldUseDark = savedTheme ? savedTheme === 'dark' : prefersDark;
    applyTheme(shouldUseDark);

    if (savedTab && document.getElementById(savedTab)) {
      activateTab(savedTab);
    } else {
      activateTab('s1');
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
