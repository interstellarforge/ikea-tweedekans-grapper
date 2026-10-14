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

  const OFFERS_URL = "https://www.ikea.com/nl/nl/second-hand/buy-from-ikea/";

  const chip = (text, kind = "") =>
    el("span", { className: `chip ${kind}`, textContent: text });

  const tagChip = (tag) => {
    if (!tag || tag.kind === "equal") return null;
    if (tag.kind === "lowest") {
      return chip(`Nieuwe laagste prijs (eerder ${money(tag.low)})`, "good");
    }
    return chip(
      `+${money(tag.diff)} t.o.v. laagste (${money(tag.low)})`,
      "bad",
    );
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
            `${g.followed ? "★ " : ""}${g.count > 1 ? g.count + "× " : ""}${g.storeName} · ${money(g.price, g.currency)}`,
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
            `${o.followed ? "★ " : ""}${o.storeName}`,
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

  const NAV = [
    ["watchlist", "/watchlist", "Watchlist"],
    ["catalog", "/catalog", "Zoeken in producten"],
    ["tweedekans", "/tweedekans", "Zoeken in tweedekanshoek"],
    ["alerts", "/alerts", "Meldingen"],
    ["settings", "/settings", "Instellingen"],
  ];

  const initShell = (active) => {
    const badge = el("span", { className: "count", hidden: true });
    const nav = el(
      "nav",
      {},
      ...NAV.map(([key, href, label]) =>
        el(
          "a",
          { href, className: key === active ? "active" : "" },
          label,
          key === "alerts" ? badge : null,
        ),
      ),
    );
    const logout = el("button", {
      className: "secondary",
      textContent: "Uitloggen",
      style: "margin-left:auto;color:#fff;border-color:rgba(255,255,255,.4)",
    });
    logout.onclick = async () => {
      await fetch("/api/logout", { method: "POST" });
      location.href = "/login";
    };
    document.body.prepend(
      el(
        "header",
        { className: "shell" },
        el(
          "div",
          { className: "inner" },
          el("a", { className: "brand", href: "/" }, "IKEA TWEEDEKANS"),
          nav,
          logout,
        ),
      ),
    );
    const refresh = async () => {
      try {
        const { unseen } = await api("/api/alerts?limit=1");
        badge.hidden = unseen === 0;
        badge.textContent = unseen;
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
    groupOffers,
    offerCard,
    initShell,
    debounce,
    empty,
  };
})();
