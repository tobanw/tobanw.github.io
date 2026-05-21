(function () {
  var prefix = null;
  var prefixTimer = null;
  var focusedIndex = -1;

  var routes = {
    h: "/",
    w: "/writing/",
    b: "/bits/",
    p: "/projects/"
  };

  function isTypingTarget(target) {
    if (!target) return false;
    var tag = target.tagName;
    return (
      target.isContentEditable ||
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      tag === "SELECT"
    );
  }

  function writingItems() {
    return Array.prototype.slice.call(document.querySelectorAll("[data-writing-list] [data-kb-item]"));
  }

  function clamp(index, items) {
    if (items.length === 0) return -1;
    return Math.max(0, Math.min(index, items.length - 1));
  }

  function move(delta) {
    var items = writingItems();
    if (items.length === 0) return;
    var active = document.activeElement;
    var activeIndex = items.indexOf(active);
    focusedIndex = clamp((activeIndex >= 0 ? activeIndex : focusedIndex) + delta, items);
    items[focusedIndex].focus();
  }

  function openFocused() {
    var items = writingItems();
    var active = document.activeElement;
    if (items.indexOf(active) >= 0) {
      active.click();
      return;
    }
    if (focusedIndex >= 0 && items[focusedIndex]) {
      items[focusedIndex].click();
    }
  }

  function openHelp() {
    var dialog = document.getElementById("keyboard-help-dialog");
    if (!dialog) return;
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
  }

  function closeHelp() {
    var dialog = document.getElementById("keyboard-help-dialog");
    if (!dialog) return;
    if (typeof dialog.close === "function") {
      dialog.close();
    } else {
      dialog.removeAttribute("open");
    }
  }

  function clearPrefix() {
    prefix = null;
    window.clearTimeout(prefixTimer);
    prefixTimer = null;
  }

  document.addEventListener("keydown", function (event) {
    if (event.defaultPrevented || isTypingTarget(event.target)) return;

    if (event.key === "?") {
      event.preventDefault();
      openHelp();
      clearPrefix();
      return;
    }

    if (prefix === "g") {
      if (routes[event.key]) {
        event.preventDefault();
        window.location.href = routes[event.key];
      }
      clearPrefix();
      return;
    }

    if (event.key === "g") {
      prefix = "g";
      window.clearTimeout(prefixTimer);
      prefixTimer = window.setTimeout(clearPrefix, 1200);
      return;
    }

    if (event.key === "j") {
      event.preventDefault();
      move(1);
      return;
    }

    if (event.key === "k") {
      event.preventDefault();
      move(-1);
      return;
    }

    if (event.key === "t") {
      if (typeof window.toggleTheme === "function") {
        event.preventDefault();
        window.toggleTheme();
      }
      return;
    }

    if (event.key === "o") {
      event.preventDefault();
      openFocused();
    }
  });

  document.addEventListener("click", function (event) {
    var trigger = event.target.closest && event.target.closest("#keyboard-help-trigger");
    var close = event.target.closest && event.target.closest("#keyboard-help-close");
    if (trigger) openHelp();
    if (close) closeHelp();
  });
})();
