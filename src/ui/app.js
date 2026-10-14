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

  const chip = (text, kind = "", iconName = "") => {
    const span = el("span", { className: `chip ${kind}`.trim() });
    if (iconName) span.append(icon(iconName));
    span.append(document.createTextNode(text));
    return span;
  };

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
            `${g.count > 1 ? g.count + "× " : ""}${g.storeName}${countryTag(g.country)} · ${money(g.price, g.currency)}`,
            g.followed ? "info" : "",
            g.followed ? "star" : "",
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
            `${o.storeName}${countryTag(o.country)}`,
            o.followed ? "info" : "",
            o.followed ? "star" : "",
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
    minus: "M5 12h14",
    close: "M6 6l12 12M18 6L6 18",
    menu: "M4 7h16M4 12h16M4 17h16",
    edit: "M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4",
    star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z",
    map: "M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14",
    phone:
      "M8 3h8a1 1 0 011 1v16a1 1 0 01-1 1H8a1 1 0 01-1-1V4a1 1 0 011-1zM11 18h2",
    bell: "M18 16v-5a6 6 0 10-12 0v5l-2 2h16zM10 21h4",
    sliders:
      "M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M9 10v4M17 16v4",
    user: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c0-4 3.6-6 8-6s8 2 8 6",
    shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
    logout: "M10 4H5v16h5M15 8l4 4-4 4M19 12H9",
    arrow: "M5 12h14M13 6l6 6-6 6",
    external: "M14 4h6v6M20 4l-9 9M18 14v5H5V6h5",
    list: "M9 6h11M9 12h11M9 18h11M4 6h1M4 12h1M4 18h1",
    route:
      "M6 19a2 2 0 100-4 2 2 0 000 4zM18 9a2 2 0 100-4 2 2 0 000 4zM8 17h6a3 3 0 000-6h-4a3 3 0 010-6h6",
    search: "M11 4a7 7 0 100 14 7 7 0 000-14zM16 16l5 5",
    tag: "M3 12V4h8l9 9-8 8zM8 8h.01",
    store:
      "M4 9l1-5h14l1 5M4 9v11h16V9M4 9a2.7 2.7 0 005.3 0 2.7 2.7 0 005.4 0A2.7 2.7 0 0020 9M10 20v-5h4v5",
    clock: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2",
  };
  /** Small inline SVG icon (24x24 viewBox). */
  const icon = (name) => {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("class", "ico");
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

  /** Round-cornered close control for dialogs. */
  const closeButton = ({ ariaLabel = "Sluiten", onclick }) => {
    const b = el("button", {
      className: "icon",
      title: ariaLabel,
      ariaLabel,
    });
    b.append(icon("close"));
    b.onclick = onclick;
    return b;
  };

  /** A node with an icon followed by text (never a glyph character). */
  const iconLabel = (name, text) => {
    const span = el("span", { className: "icon-label" });
    span.append(icon(name), document.createTextNode(text));
    span.style.display = "inline-flex";
    span.style.alignItems = "center";
    span.style.gap = "6px";
    return span;
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
        closeButton({
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
      el("option", { value: "new", textContent: "Nieuwe lijst…" }),
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
        closeButton({
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
    ["catalog", "/catalog", "Producten"],
    ["tweedekans", "/tweedekans", "Aanbod"],
    ["trips", "/trips", "Ritje-check"],
  ];

  const MENU = [
    ["alerts", "/alerts", "Meldingen", "bell"],
    ["settings", "/settings", "Instellingen", "sliders"],
    ["profile", "/profile", "Profiel", "user"],
  ];
  const ADMIN_ITEM = ["admin", "/admin", "Beheer", "shield"];

  /** The brand mark: a yellow price tag with a blue eyelet. */
  const brandMark = () => {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 32 32");
    svg.setAttribute("class", "brand-mark");
    svg.setAttribute("aria-hidden", "true");
    const tag = document.createElementNS(ns, "path");
    tag.setAttribute(
      "d",
      "M2.5 16 12 4.5h15a2.5 2.5 0 0 1 2.5 2.5v18a2.5 2.5 0 0 1-2.5 2.5H12z",
    );
    tag.setAttribute("fill", "#FFDB00");
    const hole = document.createElementNS(ns, "circle");
    hole.setAttribute("cx", "11.5");
    hole.setAttribute("cy", "16");
    hole.setAttribute("r", "2.3");
    hole.setAttribute("fill", "#0058A3");
    const line = document.createElementNS(ns, "path");
    line.setAttribute("d", "M17.5 12.5h7M17.5 16.5h7M17.5 20.5h4");
    line.setAttribute("stroke", "#0058A3");
    line.setAttribute("stroke-width", "2");
    line.setAttribute("stroke-linecap", "round");
    line.setAttribute("fill", "none");
    svg.append(tag, hole, line);
    return svg;
  };

  const initShell = (active) => {
    const badge = el("span", { className: "count", hidden: true });
    const nav = el(
      "nav",
      { ariaLabel: "Hoofdmenu" },
      ...NAV.map(([key, href, label]) =>
        el("a", {
          href,
          className: key === active ? "active" : "",
          textContent: label,
          ariaCurrent: key === active ? "page" : undefined,
        }),
      ),
    );

    const initial = el("span", { textContent: "·" });
    const avatar = el(
      "button",
      {
        className: `avatar${[...MENU, ADMIN_ITEM].some(([k]) => k === active) ? " active" : ""}`,
        ariaLabel: "Profiel en menu",
        ariaHaspopup: "true",
        ariaExpanded: "false",
      },
      initial,
      badge,
    );
    const menuBadge = el("span", { className: "count", hidden: true });
    const who = el("div", { className: "menu-who", textContent: "" });
    const item = (href, label, iconName, extra = null) => {
      const a = el("a", { href, className: "menu-item" });
      a.append(icon(iconName), document.createTextNode(label));
      if (extra) a.append(extra);
      return a;
    };
    const logout = el("button", { className: "menu-item" });
    logout.append(icon("logout"), document.createTextNode("Uitloggen"));
    logout.onclick = async () => {
      await fetch("/api/logout", { method: "POST" });
      location.href = "/";
    };
    const mainItems = MENU.map(([key, href, label, iconName]) => {
      const a = item(
        href,
        label,
        iconName,
        key === "alerts" ? menuBadge : null,
      );
      if (key === active) a.classList.add("active");
      return a;
    });
    const adminLink = item(ADMIN_ITEM[1], ADMIN_ITEM[2], ADMIN_ITEM[3]);
    adminLink.hidden = true;
    if (active === "admin") adminLink.classList.add("active");
    const menu = el(
      "div",
      { className: "menu", role: "menu", hidden: true },
      who,
      ...mainItems,
      adminLink,
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

    const brand = el("a", {
      className: "brand",
      href: "/",
      title: "Tweedekanshoek",
    });
    brand.append(brandMark(), el("span", {}, "Tweedekanshoek"));
    const burger = el("button", {
      className: "burger",
      ariaLabel: "Menu openen",
      ariaExpanded: "false",
    });
    burger.append(icon("menu"));
    const header = el(
      "header",
      { className: "shell" },
      el(
        "div",
        { className: "inner" },
        brand,
        nav,
        el("div", { className: "profile" }, avatar, menu),
        burger,
      ),
    );
    const setNav = (open) => {
      header.classList.toggle("nav-open", open);
      burger.setAttribute("aria-expanded", String(open));
      burger.setAttribute("aria-label", open ? "Menu sluiten" : "Menu openen");
      burger.replaceChildren(icon(open ? "close" : "menu"));
    };
    burger.onclick = (e) => {
      e.stopPropagation();
      setNav(!header.classList.contains("nav-open"));
    };
    document.addEventListener("click", (e) => {
      if (!header.contains(e.target)) setNav(false);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") setNav(false);
    });
    document.body.prepend(header);

    api("/api/profile")
      .then((p) => {
        const name = p.email || p.username || "gebruiker";
        initial.textContent = name.charAt(0).toUpperCase();
        who.textContent = name;
        who.title = name;
        adminLink.hidden = p.role !== "admin";
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
    closeButton,
    iconLabel,
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
