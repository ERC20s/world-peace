// Minimal JS: client-side filter for the conflicts list and mobile helpers.
// No dependencies, ES5 only, safe to open straight from the file system.
document.addEventListener('DOMContentLoaded', function () {
  var input = document.getElementById('conflict-search');
  var list = document.getElementById('conflict-list');
  var status = document.getElementById('conflict-search-status');
  if (!input || !list) return;

  var items = Array.prototype.slice.call(list.querySelectorAll('li'));

  // Everything an item can be matched against: its visible link text plus the
  // factual terms an editor put in data-keywords (region, parties, agreement
  // names, years). Items with no data-keywords still match on link text.
  function haystack(li) {
    var text = li.textContent || '';
    var keywords = li.getAttribute('data-keywords') || '';
    return (text + ' ' + keywords).toLowerCase().replace(/\s+/g, ' ');
  }

  // Every whitespace-separated term of the query must appear somewhere, so
  // "liberia accra" narrows rather than widens.
  function matches(hay, terms) {
    for (var i = 0; i < terms.length; i++) {
      if (hay.indexOf(terms[i]) === -1) return false;
    }
    return true;
  }

  function plural(n) { return n === 1 ? 'conflict' : 'conflicts'; }

  function say(message) {
    if (!status) return;
    if (message) {
      status.textContent = message;
      status.removeAttribute('hidden');
    } else {
      status.textContent = '';
      status.setAttribute('hidden', 'hidden');
    }
  }

  function apply(query) {
    var q = (query || '').trim().toLowerCase();
    var terms = q === '' ? [] : q.split(/\s+/);
    var shown = 0;
    for (var i = 0; i < items.length; i++) {
      var hit = terms.length === 0 || matches(haystack(items[i]), terms);
      items[i].style.display = hit ? '' : 'none';
      if (hit) shown++;
    }
    if (terms.length === 0) {
      say('');
    } else if (shown === 0) {
      say('No conflicts match "' + q + '" — try a country, region or agreement name.');
    } else {
      say('Showing ' + shown + ' of ' + items.length + ' ' + plural(items.length) + '.');
    }
    return shown;
  }

  // Keep the address bar in step so a filtered list can be linked to. Some
  // file:// loads refuse replaceState; a failure here must not break search.
  function mirror(query) {
    if (!window.history || !history.replaceState) return;
    try {
      var base = location.pathname + (query ? '?q=' + encodeURIComponent(query) : '') + location.hash;
      history.replaceState(null, '', base);
    } catch (err) { /* file:// or a sandboxed frame: harmless */ }
  }

  function readQueryParam() {
    var match = /[?&]q=([^&#]*)/.exec(location.search || '');
    if (!match) return '';
    try {
      return decodeURIComponent(match[1].replace(/\+/g, ' '));
    } catch (err) {
      return match[1];
    }
  }

  input.addEventListener('input', function () {
    apply(input.value);
    mirror(input.value.trim());
  });

  // Escape clears the box and restores the full list.
  input.addEventListener('keydown', function (e) {
    var key = e.key || e.keyCode;
    if (key === 'Escape' || key === 'Esc' || key === 27) {
      if (input.value !== '') {
        input.value = '';
        apply('');
        mirror('');
      }
    }
  });

  // Deep link: index.html?q=liberia arrives filtered.
  var initial = readQueryParam();
  if (initial) {
    input.value = initial;
    apply(initial);
  }
});
