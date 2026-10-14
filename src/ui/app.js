const App = (() => {
  const $ = (id) => document.getElementById(id);

  const api = async (path, opts) => {
    const res = await fetch(path, opts);
    if (res.status === 401) {
      location.href = `/login?next=${encodeURIComponent(location.pathname)}`;
      throw new Error("Niet ingelogd");
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  };
  const send = (path, method, body) =>
    api(path, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  const el = (tag, props = {}, ...kids) => {
    const e = Object.assign(document.createElement(tag), props);
    e.append(
      ...kids
        .flat()
        .filter((k) => k !== undefined && k !== null && k !== false),
    );
    return e;
  };

  const money = (v, currency = "EUR") =>
    new Intl.NumberFormat("nl-NL", { style: "currency", currency }).format(v);

  const ago = (ms) => {
    if (!ms) return "nooit";
    const m = Math.round((Date.now() - ms) / 60000);
    if (m < 1) return "zojuist";
    if (m < 60) return `${m} min geleden`;
    if (m < 1440) return `${Math.round(m / 60)} uur geleden`;
    return `${Math.round(m / 1440)} d geleden`;
  };

  /** 135 -> "2u 15m", 40 -> "40 min". */
  const duration = (minutes) => {
    const m = Math.round(minutes);
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    const rest = m % 60;
    return rest ? `${h}u ${rest}m` : `${h}u`;
  };

  const COUNTRY_PATH = { nl: "nl/nl", be: "be/nl", de: "de/de" };
  const OFFERS_URL = "https://www.ikea.com/nl/nl/second-hand/buy-from-ikea/";

  /** " (BE)" for stores outside the Netherlands, so duplicate-looking names stay clear. */
  const countryTag = (country) =>
    !country || country === "nl" ? "" : ` (${country.toUpperCase()})`;

  /** Deep link to one offer on IKEA's tweedekanshoek page. */
  const ikeaOfferUrl = (storeName, offerNumber, country = "nl") => {
    const slug = storeName
      .toLowerCase()
      .replace(/ikea /g, "")
      .trim()
      .replace(/\//g, "")
      .replace(/-/g, "")
      .replace(/\s+/g, "+");
    const path = COUNTRY_PATH[country] ?? COUNTRY_PATH.nl;
    return `https://www.ikea.com/${path}/second-hand/buy-from-ikea/#/${slug}/${offerNumber}`;
  };

  const chip = (text, kind = "") =>
    el("span", { className: `chip ${kind}`, textContent: text });

  /** "€2,50" without the space, for compact chips. */
  const moneyTight = (v, currency = "EUR") =>
    money(v, currency).replace(/\s/g, "");

  const tagChip = (tag) => {
    if (!tag || tag.kind === "equal") return null;
    if (tag.kind === "lowest") return chip("Laagste prijs", "good");
    return chip(`+${moneyTight(tag.diff)}`, "bad");
  };

  /** Collapses identical offers (same store, price, tag) and puts followed stores first. */
  const groupOffers = (offers) => {
    const groups = new Map();
    for (const o of offers) {
      const key = [
        o.storeId,
        o.price,
        o.condition,
        o.reason,
        o.originalPrice,
      ].join("|");
      const g = groups.get(key);
      if (g) {
        g.count += 1;
        g.firstSeen = Math.min(g.firstSeen, o.firstSeen);
      } else {
        groups.set(key, { ...o, count: 1 });
      }
    }
    return [...groups.values()].sort(
      (a, b) => Number(b.followed) - Number(a.followed) || a.price - b.price,
    );
  };

  /** Chips for a catalog article: where it lies and at which price, plus price comparison. */
  const insightChips = (insight, max = 3) => {
    if (!insight) return [];
    const groups = groupOffers(insight.offers);
    const rows = groups
      .slice(0, max)
      .map((g) =>
        el(
          "div",
          { className: "chips" },
          chip(
            `${g.followed ? "★ " : ""}${g.count > 1 ? g.count + "× " : ""}${g.storeName}${countryTag(g.country)} · ${money(g.price, g.currency)}`,
            g.followed ? "info" : "",
          ),
          tagChip(g.tag),
        ),
      );
    if (groups.length > max) {
      rows.push(
        el("div", { className: "chips" }, chip(`+${groups.length - max} meer`)),
      );
    }
    if (insight.lowestEver !== undefined && insight.offers.length === 0) {
      rows.push(
        el(
          "div",
          { className: "chips" },
          chip(`Laagste eerder gemeten: ${money(insight.lowestEver)}`),
        ),
      );
    }
    return rows;
  };

  const offerCard = (o) => {
    const isNew = Date.now() - o.firstSeen < 24 * 3600e3;
    return el(
      "a",
      {
        className: "card",
        href: o.articleNumber ? `/product/${o.articleNumber}` : OFFERS_URL,
        style: "color:inherit;text-decoration:none",
      },
      el("img", { src: o.image || "", loading: "lazy", alt: "" }),
      el(
        "div",
        { className: "body" },
        el("div", { className: "title", textContent: o.title }),
        el("div", { className: "meta", textContent: o.description }),
        el(
          "div",
          {},
          el("span", {
            className: "price",
            textContent: money(o.price, o.currency),
          }),
          o.originalPrice
            ? el("span", {
                className: "old",
                textContent: money(o.originalPrice, o.currency),
              })
            : null,
        ),
        el(
          "div",
          { className: "chips" },
          isNew ? chip("Nieuw", "new") : null,
          chip(
            `${o.followed ? "★ " : ""}${o.storeName}${countryTag(o.country)}`,
            o.followed ? "info" : "",
          ),
          o.condition ? chip(o.condition) : null,
          tagChip(o.tag),
        ),
        el("div", {
          className: "meta",
          textContent: `art. ${o.articleNumber ?? "–"} · aanbieding ${o.offerNumber} · ${ago(o.firstSeen)}`,
        }),
      ),
    );
  };

  const SVG = {
    trash: "M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6",
    eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z",
    check: "M4 12l5 5L20 6",
    undo: "M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3",
    plus: "M12 5v14M5 12h14",
    edit: "M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4",
  };
  /** Small inline SVG icon (24x24 viewBox). */
  const icon = (name) => {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", SVG[name] ?? "");
    svg.append(path);
    return svg;
  };
  const iconButton = (name, label, onclick, extra = "") => {
    const b = el("button", {
      className: `icon ${extra}`.trim(),
      title: label,
      ariaLabel: label,
    });
    b.append(icon(name));
    b.onclick = onclick;
    return b;
  };

  /** Builds a modal dialog; returns { dlg, close }. Resolves nothing itself. */
  const makeModal = (title, bodyNodes, footNodes) => {
    const dlg = el("dialog", { className: "modal" });
    const close = () => {
      if (dlg.open) dlg.close();
    };
    dlg.append(
      el(
        "div",
        { className: "head" },
        el("h2", { textContent: title }),
        el("button", {
          className: "secondary",
          textContent: "✕",
          ariaLabel: "Sluiten",
          onclick: close,
        }),
      ),
      el("div", { className: "body" }, ...bodyNodes),
      el("div", { className: "foot" }, ...footNodes),
    );
    dlg.addEventListener("close", () => dlg.remove());
    document.body.append(dlg);
    return { dlg, close };
  };

  /** Custom replacement for window.prompt. Resolves to the text, or undefined when cancelled. */
  const promptDialog = ({
    title,
    label,
    value = "",
    confirmText = "Opslaan",
    placeholder = "",
  }) =>
    new Promise((resolve) => {
      const input = el("input", {
        type: "text",
        value,
        placeholder,
        style: "width: 100%",
      });
      let result;
      const ok = el("button", { textContent: confirmText });
      const cancel = el("button", {
        className: "secondary",
        textContent: "Annuleren",
      });
      const { dlg, close } = makeModal(
        title,
        [
          el("label", {
            textContent: label,
            style: "display:block;margin-bottom:8px",
          }),
          input,
        ],
        [cancel, ok],
      );
      const submit = () => {
        const v = input.value.trim();
        if (!v) return input.focus();
        result = v;
        close();
      };
      ok.onclick = submit;
      cancel.onclick = close;
      input.onkeydown = (e) => {
        if (e.key === "Enter") submit();
      };
      dlg.addEventListener("close", () => resolve(result));
      dlg.showModal();
      input.focus();
      input.select();
    });

  /** Custom replacement for window.confirm. */
  const confirmDialog = ({
    title,
    message,
    confirmText = "Verwijderen",
    danger = true,
  }) =>
    new Promise((resolve) => {
      let result = false;
      const ok = el("button", {
        textContent: confirmText,
        className: danger ? "danger" : "",
      });
      const cancel = el("button", {
        className: "secondary",
        textContent: "Annuleren",
      });
      const { dlg, close } = makeModal(
        title,
        [el("p", { textContent: message, style: "margin:0" })],
        [cancel, ok],
      );
      ok.onclick = () => {
        result = true;
        close();
      };
      cancel.onclick = close;
      dlg.addEventListener("close", () => resolve(result));
      dlg.showModal();
      cancel.focus();
    });

  /** Dialog to put a product on one of the shopping lists (or a new one). */
  const addToList = async (product) => {
    const lists = await api("/api/lists");
    const dlg = el("dialog", { className: "modal" });
    const select = el(
      "select",
      {},
      ...lists.map((l) =>
        el("option", { value: String(l.id), textContent: l.name }),
      ),
      el("option", { value: "new", textContent: "＋ Nieuwe lijst…" }),
    );
    const newName = el("input", {
      type: "text",
      placeholder: "Naam van de nieuwe lijst",
      hidden: !!lists.length,
    });
    if (!lists.length) select.value = "new";
    select.onchange = () => {
      newName.hidden = select.value !== "new";
    };
    const qty = el("input", {
      type: "number",
      min: 1,
      max: 99,
      value: 1,
      style: "width: 90px",
    });
    const msg = el("span", { className: "hint" });
    const close = () => {
      dlg.close();
      dlg.remove();
    };
    const save = el("button", { textContent: "Toevoegen" });
    save.onclick = async () => {
      save.disabled = true;
      try {
        let listId = Number(select.value);
        if (select.value === "new") {
          const created = await send("/api/lists", "POST", {
            name: newName.value || "Nieuwe lijst",
          });
          listId = created.id;
        }
        await send(`/api/lists/${listId}/items`, "POST", {
          articleNumber: product.articleNumber,
          quantity: Number(qty.value) || 1,
          mode: "add",
          product,
        });
        msg.textContent = "Toegevoegd";
        setTimeout(close, 600);
      } catch (e) {
        msg.className = "err";
        msg.textContent = e.message;
        save.disabled = false;
      }
    };
    dlg.append(
      el(
        "div",
        { className: "head" },
        el("h2", { textContent: "Op boodschappenlijst" }),
        el("button", {
          className: "secondary",
          textContent: "✕",
          ariaLabel: "Sluiten",
          onclick: close,
        }),
      ),
      el(
        "div",
        { className: "body" },
        el(
          "p",
          {},
          el("strong", {
            textContent: `${product.name} ${product.typeName ?? ""}`.trim(),
          }),
        ),
        el(
          "div",
          { className: "row" },
          el("label", { textContent: "Lijst" }),
          select,
          newName,
        ),
        el(
          "div",
          { className: "row" },
          el("label", { textContent: "Aantal" }),
          qty,
        ),
      ),
      el(
        "div",
        { className: "foot" },
        msg,
        el("button", {
          className: "secondary",
          textContent: "Annuleren",
          onclick: close,
        }),
        save,
      ),
    );
    document.body.append(dlg);
    dlg.addEventListener("close", () => dlg.remove());
    dlg.showModal();
  };

  const NAV = [
    ["watchlist", "/watchlist", "Lijsten"],
    ["catalog", "/catalog", "Zoeken in producten"],
    ["tweedekans", "/tweedekans", "Zoeken in tweedekanshoek"],
    ["trips", "/trips", "Ritje-check"],
  ];

  const MENU = [
    ["alerts", "/alerts", "Meldingen"],
    ["settings", "/settings", "Instellingen"],
    ["profile", "/profile", "Profiel"],
  ];

  const initShell = (active) => {
    const badge = el("span", { className: "count", hidden: true });
    const nav = el(
      "nav",
      {},
      ...NAV.map(([key, href, label]) =>
        el("a", { href, className: key === active ? "active" : "" }, label),
      ),
    );

    const initial = el("span", {
      className: "avatar-letter",
      textContent: "·",
    });
    const avatar = el(
      "button",
      {
        className: `avatar${MENU.some(([k]) => k === active) ? " active" : ""}`,
        ariaLabel: "Profiel en menu",
        ariaHaspopup: "true",
        ariaExpanded: "false",
      },
      initial,
      badge,
    );
    const menuBadge = el("span", { className: "count", hidden: true });
    const who = el("div", { className: "menu-who", textContent: "" });
    const logout = el("button", {
      className: "menu-item",
      textContent: "Uitloggen",
    });
    logout.onclick = async () => {
      await fetch("/api/logout", { method: "POST" });
      location.href = "/login";
    };
    const menu = el(
      "div",
      { className: "menu", role: "menu", hidden: true },
      who,
      ...MENU.map(([key, href, label]) =>
        el(
          "a",
          { href, className: `menu-item${key === active ? " active" : ""}` },
          label,
          key === "alerts" ? menuBadge : null,
        ),
      ),
      el("hr"),
      logout,
    );
    const setOpen = (open) => {
      menu.hidden = !open;
      avatar.setAttribute("aria-expanded", String(open));
    };
    avatar.onclick = (e) => {
      e.stopPropagation();
      setOpen(menu.hidden);
    };
    document.addEventListener("click", (e) => {
      if (!menu.contains(e.target)) setOpen(false);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") setOpen(false);
    });

    document.body.prepend(
      el(
        "header",
        { className: "shell" },
        el(
          "div",
          { className: "inner" },
          el("a", { className: "brand", href: "/" }, "IKEA TWEEDEKANS"),
          nav,
          el("div", { className: "profile" }, avatar, menu),
        ),
      ),
    );

    api("/api/profile")
      .then((p) => {
        const name = p.username || "gebruiker";
        initial.textContent = name.charAt(0).toUpperCase();
        who.textContent = name;
      })
      .catch(() => {
        /* the menu still works without the name */
      });

    const refresh = async () => {
      try {
        const { unseen } = await api("/api/alerts?limit=1");
        for (const b of [badge, menuBadge]) {
          b.hidden = unseen === 0;
          b.textContent = unseen;
        }
        document.title = `${unseen ? `(${unseen}) ` : ""}${document.title.replace(/^\(\d+\) /, "")}`;
      } catch {
        /* shell badge is best effort */
      }
    };
    refresh();
    setInterval(refresh, 60000);
    return refresh;
  };

  const debounce = (fn, ms = 350) => {
    let t;
    return (...a) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...a), ms);
    };
  };

  const empty = (text) => el("div", { className: "empty", textContent: text });

  return {
    $,
    api,
    send,
    el,
    money,
    ago,
    chip,
    tagChip,
    insightChips,
    ikeaOfferUrl,
    countryTag,
    moneyTight,
    promptDialog,
    confirmDialog,
    icon,
    iconButton,
    addToList,
    duration,
    groupOffers,
    offerCard,
    initShell,
    debounce,
    empty,
  };
})();
