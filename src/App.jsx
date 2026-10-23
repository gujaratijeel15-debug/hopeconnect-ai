import { useEffect, useMemo, useState } from "react";
import Assistant from "./Assistant.jsx";
import Panel from "./Panel.jsx";

const initial = [
  {
    _id: "n1",
    kind: "need",
    title: "Food for families",
    description: "Food packets needed for families facing financial hardship.",
    category: "Food",
    location: "Pune",
    urgency: "High",
    quantity: 20,
    status: "Open",
  },
  {
    _id: "o1",
    kind: "offer",
    title: "Fresh food packets",
    description: "Freshly packed food available for local families.",
    category: "Food",
    location: "Pune",
    urgency: "Normal",
    quantity: 25,
    status: "Available",
  },
  {
    _id: "n2",
    kind: "need",
    title: "Winter clothing",
    description: "Warm clothes required for people without adequate shelter.",
    category: "Clothing",
    location: "Nashik",
    urgency: "Critical",
    quantity: 15,
    status: "Open",
  },
  {
    _id: "o2",
    kind: "offer",
    title: "Warm clothes available",
    description: "Clean winter jackets and sweaters available for donation.",
    category: "Clothing",
    location: "Nashik",
    urgency: "Normal",
    quantity: 30,
    status: "Available",
  },
  {
    _id: "n3",
    kind: "need",
    title: "School supplies",
    description:
      "Notebooks and stationery for students from low-income families.",
    category: "Education",
    location: "Pune",
    urgency: "Normal",
    quantity: 12,
    status: "Open",
  },
  {
    _id: "o3",
    kind: "offer",
    title: "Stationery donation",
    description: "Notebooks and pencils ready to be distributed to students.",
    category: "Education",
    location: "Pune",
    urgency: "Normal",
    quantity: 20,
    status: "Available",
  },
];
const categories = [
  "Food",
  "Clothing",
  "Shelter",
  "Education",
  "Healthcare",
  "Other",
];
const readSaved = () => {
  try {
    const v = JSON.parse(localStorage.getItem("hc-demo-items"));
    return Array.isArray(v) ? v.filter((item) => !item?.owner || item.owner === "demo") : initial;
  } catch {
    return initial;
  }
};
const same = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();
export function scoreMatch(n, o) {
  if (
    n.kind !== "need" ||
    o.kind !== "offer" ||
    n.status !== "Open" ||
    o.status !== "Available" ||
    n.category !== o.category ||
    Number(o.quantity) <= 0
  )
    return null;
  const samePlace = same(n.location, o.location),
    enough = Number(o.quantity) >= Number(n.quantity);
  if (!samePlace) return null;
  return {
    score:
      60 +
      25 +
      (enough ? 10 : 3) +
      (["High", "Critical"].includes(n.urgency) ? 5 : 0),
    enough,
    samePlace,
  };
}

function Icon({ name }) {
  const p = {
    heart: (
      <>
        <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    pin: (
      <>
        <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="2" />
      </>
    ),
    arrow: (
      <>
        <path d="M5 12h14M13 6l6 6-6 6" />
      </>
    ),
    spark: (
      <>
        <path d="m12 3 1.9 5.8L20 11l-6.1 2.1L12 19l-1.9-5.9L4 11l6.1-2.2L12 3Z" />
        <path d="m19 14 1.1 2.9L23 18l-2.9 1.1L19 22l-1.1-2.9L15 18l2.9-1.1L19 14Z" />
      </>
    ),
  };
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {p[name]}
    </svg>
  );
}

export default function App() {
  const path = window.location.pathname;
  if (path === "/user" || path === "/provider") return <Panel panel={path.slice(1)} />;
  return <Dashboard />;
}

function Dashboard() {
  const [items, setItems] = useState(readSaved),
    [view, setView] = useState("All"),
    [category, setCategory] = useState("All categories"),
    [status, setStatus] = useState("All statuses"),
    [query, setQuery] = useState(""),
    [dialog, setDialog] = useState(""),
    [toast, setToast] = useState(""),
    [profile, setProfile] = useState(false),
    [user] = useState({ name: "Local user", api: true }),
    [speech, setSpeech] = useState(false),
    [aiMode, setAiMode] = useState("Rule-based demo"),
    [matchExplanations, setMatchExplanations] = useState({});
  const [menuOpen, setMenuOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  useEffect(() => {
    if (window.location.pathname !== "/") window.history.replaceState(null, "", "/");
  }, []);
  useEffect(() => {
    if (items.every((item) => !item?.owner || item.owner === "demo"))
      localStorage.setItem("hc-demo-items", JSON.stringify(items));
  }, [items, user]);
  useEffect(() => {
    const targets = document.querySelectorAll(".hero-copy,.hero-art,.impact,.board-section,.how,.closing");
    if (!("IntersectionObserver" in window)) { targets.forEach((node) => node.classList.add("is-visible")); return; }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => { if (entry.isIntersecting) { entry.target.classList.add("is-visible"); observer.unobserve(entry.target); } });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    targets.forEach((node) => { node.classList.add("reveal"); observer.observe(node); });
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const cards = document.querySelectorAll(".listing,.impact-stat,.steps article");
    cards.forEach((card, index) => { card.style.setProperty("--stagger", `${Math.min(index, 8) * 55}ms`); card.classList.add("card-enter"); });
    return () => cards.forEach((card) => card.classList.remove("card-enter"));
  }, [items, view, category, status, query]);
  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then(async (d) => {
        setAiMode(
          d.aiConfigured ? `${d.aiProvider || "AI"} ready` : "Configure AI provider",
        );
        if (d.database === "connected") {
          const r = await fetch("/api/entries?limit=50");
          if (r.ok) {
            const data = await r.json();
            setItems(data.items);
          }
        }
      })
      .catch(() => {});
  }, []);
  const pairs = useMemo(() => {
    const out = [];
    for (const n of items.filter((i) => i.kind === "need"))
      for (const o of items.filter((i) => i.kind === "offer")) {
        const result = scoreMatch(n, o);
        if (result) out.push({ n, o, ...result });
      }
    return out.sort((a, b) => b.score - a.score);
  }, [items]);
  const needs = items.filter((i) => i.kind === "need" && i.status === "Open"),
    offers = items.filter(
      (i) => i.kind === "offer" && i.status === "Available",
    );
  const visible = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (view === "Matches")
      return pairs.filter(
        ({ n, o }) =>
          (category === "All categories" || n.category === category) &&
          [n.title, n.description, n.location, o.title, o.description].some(
            (s) => s.toLowerCase().includes(q),
          ),
      );
    return items.filter(
      (i) =>
        (view === "All" || view === "My posts" ||
          (view === "Needs"
            ? i.kind === "need"
            : view === "Offers"
              ? i.kind === "offer"
              : false)) &&
        (category === "All categories" || i.category === category) &&
        (status === "All statuses" || i.status === status) &&
        (!q ||
          [i.title, i.description, i.location, i.category].some((s) =>
            s.toLowerCase().includes(q),
          )),
    );
  }, [items, pairs, view, category, status, query, user]);
  const notify = (m) => {
    setToast(m);
    setTimeout(() => setToast(""), 2800);
  };
  function startSpeech() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      notify(
        "Speech recognition is not supported here. You can type in the description.",
      );
      return;
    }
    const rec = new SR();
    rec.lang = "en-IN";
    rec.onresult = (e) => {
      const box = document.querySelector("#description");
      if (box)
        box.value = (box.value + " " + e.results[0][0].transcript).trim();
    };
    rec.onerror = () =>
      notify("Voice input did not work. Please type your description.");
    rec.onend = () => setSpeech(false);
    setSpeech(true);
    rec.start();
  }
  async function structureDescription() {
    const text = document.querySelector("#description")?.value?.trim();
    if (!text) { notify("Describe what is needed or available first."); return; }
    try {
      const response = await fetch("/api/ai/structure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, kind: dialog }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not structure this description.");
      const draft = body.result;
      document.querySelector('[name="title"]').value = draft.title;
      document.querySelector('[name="category"]').value = draft.category;
      if (draft.location) document.querySelector('[name="location"]').value = draft.location;
      document.querySelector('[name="quantity"]').value = draft.quantity ?? "";
      document.querySelector('[name="urgency"]').value = draft.urgency;
      notify(`Draft suggestions filled using ${draft.mode}. Review and edit before publishing.`);
    } catch (error) { notify(error.message); }
  }
  async function submitItem(e) {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      kind = dialog;
    const payload = {
      title: String(f.get("title")).trim(),
      description: String(f.get("description")).trim(),
      category: String(f.get("category")),
      location: String(f.get("location")).trim(),
      urgency: String(f.get("urgency")),
      quantity: Number(f.get("quantity")),
    };
    try {
      const r = await fetch(`/api/entries/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Unable to publish.");
      setItems((prev) => [data.item, ...prev]);
      setDialog("");
      notify("Published to the community board.");
    } catch (err) {
      notify(err.message);
    }
  }
  async function toggleStatus(item) {
    const ownerId =
      typeof item.owner === "object" ? item.owner?._id : item.owner;
    const nextStatus =
      item.status === "Fulfilled"
        ? item.kind === "need"
          ? "Open"
          : "Available"
        : "Fulfilled";
    try {
      const r = await fetch(`/api/entries/${item._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Unable to update status.");
      setItems((prev) => prev.map((i) => (i._id === item._id ? data.item : i)));
      notify("Status updated.");
    } catch (err) { notify(err.message); }
  }
  async function showMyPosts() {
    setProfile(false);
    setView("My posts");
    try {
      const r = await fetch("/api/me/entries");
      const data = await r.json();
      if (r.ok) setItems((prev) => [...data.items, ...prev.filter((i) => !data.items.some((d) => d._id === i._id))]);
    } catch { notify("Could not load your posts."); }
    document.querySelector("#board")?.scrollIntoView({ behavior: "smooth" });
  }
  async function explainMatch(need, offer) {
    const key = `${need._id}-${offer._id}`;
    try {
      const r = await fetch("/api/ai/explain-match", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          need: {
            category: need.category,
            location: need.location,
            quantity: Number(need.quantity),
            urgency: need.urgency,
          },
          offer: {
            category: offer.category,
            location: offer.location,
            quantity: Number(offer.quantity),
          },
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Could not explain this match.");
      setMatchExplanations((prev) => ({
        ...prev,
        [key]: `${data.explanation} (${data.mode})`,
      }));
    } catch (err) {
      notify(err.message);
    }
  }
  const active = (v) => setView(v);
  return (
    <>
      <header className="topbar">
        <a href="#home" className="brand">
          <span className="brand-mark">
            <Icon name="heart" />
          </span>
          <span>
            hopeconnect<span className="green">.ai</span>
          </span>
        </a>
        <nav id="mobile-navigation" className={`main-nav${menuOpen ? " is-open" : ""}`} aria-label="Main navigation">
          <a href="#home" onClick={() => setMenuOpen(false)}>Home</a>
          <a href="#board" onClick={() => { active("All"); setMenuOpen(false); }}>
            Community
          </a>
          <a href="#how" onClick={() => setMenuOpen(false)}>How it works</a>
          <a href="#about" onClick={() => setMenuOpen(false)}>About</a>
        </nav>
        <button className="menu-toggle" aria-expanded={menuOpen} aria-controls="mobile-navigation" onClick={() => setMenuOpen((open) => !open)} aria-label={menuOpen ? "Close navigation" : "Open navigation"}>{menuOpen ? "×" : "☰"}</button>
        <div className="head-actions">
          <button className="avatar" onClick={() => setProfile(!profile)} aria-label="Open local dashboard">L</button>
          <span className="text-button">Single-user mode</span>
          <a className="text-button" href="/user">My dashboard</a>
          <a className="text-button" href="/provider">Offers</a>
          <button className="primary small" onClick={() => setDialog("need")}>
            Ask for help <span>↗</span>
          </button>
        </div>
      </header>
      <main id="home">
        <section className="hero wrap">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="live-dot" /> COMMUNITY-POWERED SUPPORT
            </div>
            <h1>
              When we show up
              <br />
              for each other,{" "}
              <em>
                hope
                <br />
                finds a way.
              </em>
            </h1>
            <p>
              One place for neighbors to ask for help, share what they can, and
              find the connection that makes a difference.
            </p>
            <div className="hero-actions">
              <button className="primary" onClick={() => setDialog("need")}>
                I need support <Icon name="arrow" />
              </button>
              <button className="secondary" onClick={() => setDialog("offer")}>
                I can offer help <span>＋</span>
              </button>
            </div>
            <div className="trust-line">
              <span className="faces">●●●</span> Real people. Local support. A
              stronger community.
            </div>
          </div>
          <div
            className="hero-art"
            aria-label="Illustration of a community growing together"
          >
            <div className="sun" />
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="float-card card-food">
              <span>🥕</span>
              <div>
                <b>Fresh groceries</b>
                <small>Shared nearby</small>
              </div>
              <span className="mini-check">✓</span>
            </div>
            <div className="float-card card-match">
              <span className="match-icon">
                <Icon name="heart" />
              </span>
              <div>
                <b>A little closer</b>
                <small>3 helpful connections</small>
              </div>
            </div>
            <div className="person person-a">
              <i />
              <b />
              <span />
            </div>
            <div className="person person-b">
              <i />
              <b />
              <span />
            </div>
            <div className="person person-c">
              <i />
              <b />
              <span />
            </div>
            <div className="plant plant-a">
              ✳<small>✳</small>
            </div>
            <div className="plant plant-b">✳</div>
            <div className="art-caption">
              <span className="caption-dot" /> Good things grow when we connect
            </div>
          </div>
        </section>
        <section className="impact wrap" aria-label="Community activity">
          <div className="impact-label">
            <span>✳</span> COMMUNITY AT A GLANCE
          </div>
          <div className="impact-stat">
            <b>{needs.length.toLocaleString()}</b>
            <span>open needs</span>
          </div>
          <div className="impact-stat">
            <b>{offers.length.toLocaleString()}</b>
            <span>resources offered</span>
          </div>
          <div className="impact-stat">
            <b>{pairs.length.toLocaleString()}</b>
            <span>potential connections</span>
          </div>
          <div className="impact-note">
            <span className="green">●</span> Every connection starts with
            someone who cares.
          </div>
        </section>
        <section className="board-section wrap" id="board">
          <div className="section-kicker">THE COMMUNITY BOARD</div>
          <div className="board-head">
            <div>
              <h2>
                See what we can do <em>together.</em>
              </h2>
              <p>
                Browse what's needed, share what's available, find your place to
                help.
              </p>
            </div>
            <button
              className="secondary desktop-offer"
              onClick={() => setDialog("offer")}
            >
              Share a resource <span>＋</span>
            </button>
          </div>
          <div className="board-controls">
            <div
              className="tabs"
              role="tablist"
              aria-label="Community board views"
            >
              {["All", "Needs", "Offers", "Matches"].map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={view === t}
                  className={view === t ? "selected" : ""}
                  onClick={() => active(t)}
                >
                  {t}
                  {t === "Matches" && (
                    <span className="tab-count">{pairs.length}</span>
                  )}
                </button>
              ))}
            </div>
            <div className="filters">
              <label className="searchbox">
                <Icon name="search" />
                <input
                  aria-label="Search the community board"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by keyword or place"
                />
              </label>
              <select
                aria-label="Filter by category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option>All categories</option>
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              {view !== "Matches" && (
                <select
                  aria-label="Filter by status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option>All statuses</option>
                  <option>Open</option>
                  <option>Available</option>
                  <option>Fulfilled</option>
                </select>
              )}
            </div>
          </div>
          {view === "Matches" && (
            <div className="match-note">
              <Icon name="spark" />
              <span>
                <b>Suggested connections</b> · {aiMode}. Scores show fit across
                category, location, quantity and urgency; they are not success
                probabilities. Please confirm details with each other.
              </span>
            </div>
          )}
          {visible.length ? (
            <div className="listing-grid">
              {view === "Matches"
                ? visible.map(({ n, o, score, enough }) => (
                    <article
                      className="listing match-listing"
                      key={`${n._id}-${o._id}`}
                    >
                      <div className="listing-top">
                        <span className="kind-pill">
                          <Icon name="spark" /> SUGGESTED MATCH
                        </span>
                        <span className="match-score">{score} fit points</span>
                      </div>
                      <h3>
                        {n.title} <span className="plus">+</span> {o.title}
                      </h3>
                      <div className="match-pair">
                        <div>
                          <small>NEED</small>
                          <p>{n.description}</p>
                        </div>
                        <div>
                          <small>OFFER</small>
                          <p>{o.description}</p>
                        </div>
                      </div>
                      <div className="listing-meta">
                        <span>
                          <Icon name="pin" />
                          {n.location}
                        </span>
                        <span>{n.category}</span>
                        <span>
                          {enough
                            ? "Quantity may cover this need"
                            : "Partial quantity — coordinate"}
                        </span>
                      </div>
                      <div className="why-match">
                        <b>Why suggested</b>
                        <span>
                          {matchExplanations[`${n._id}-${o._id}`] ||
                            `Same category and location${enough ? ", with sufficient listed quantity." : ", but quantity is limited."} ${["High", "Critical"].includes(n.urgency) ? "Urgency is prioritized." : ""}`}
                        </span>
                        <button
                            className="text-button"
                            onClick={() => explainMatch(n, o)}
                          >
                            Explain with AI
                          </button>
                      </div>
                      <button
                        className="outline full"
                        onClick={() =>
                          notify(
                            "Please confirm availability and coordinate directly. Contact details are kept private in this demo.",
                          )
                        }
                      >
                        Review this connection <Icon name="arrow" />
                      </button>
                    </article>
                  ))
                : visible.map((item) => (
                    <article className="listing" key={item._id}>
                      <div className="listing-top">
                        <span
                          className={`kind-pill ${item.kind === "offer" ? "offer" : ""}`}
                        >
                          <span className="pill-dot" />
                          {item.kind === "need"
                            ? "HELP NEEDED"
                            : "RESOURCE OFFER"}
                        </span>
                        <span
                          className={`urgency ${item.urgency.toLowerCase()}`}
                        >
                          {item.urgency === "Normal"
                            ? "●"
                            : item.urgency === "High"
                              ? "●●"
                              : "●●●"}{" "}
                          {item.urgency}
                        </span>
                      </div>
                      <h3>{item.title}</h3>
                      <p className="listing-desc">{item.description}</p>
                      <div className="listing-meta">
                        <span>
                          <Icon name="pin" />
                          {item.location}
                        </span>
                        <span>{item.category}</span>
                        <span>Quantity · {item.quantity}</span>
                      </div>
                      <div className="listing-bottom">
                        <span className="status">
                          <i /> {item.status}
                        </span>
                        <button
                          className="text-button"
                          onClick={() => toggleStatus(item)}
                        >
                          {item.status === "Fulfilled" ? "Reopen" : "Mark fulfilled"}
                        </button>
                      </div>
                    </article>
                  ))}
            </div>
          ) : (
            <div className="empty">
              <span>✳</span>
              <h3>Nothing here just yet</h3>
              <p>
                Try a different search, or be the first to add a request or
                offer.
              </p>
              <button
                className="primary"
                onClick={() => setDialog(view === "Offers" ? "offer" : "need")}
              >
                Add to the board <Icon name="arrow" />
              </button>
            </div>
          )}
        </section>
        <section className="how wrap" id="how">
          <div className="how-intro">
            <div className="section-kicker">A SIMPLE WAY TO SHOW UP</div>
            <h2>
              Small steps.
              <br />
              <em>Real support.</em>
            </h2>
            <p>
              Getting help shouldn't be complicated. We make it easier to find
              the people and resources already around you.
            </p>
            <span className="how-asterisk">✳</span>
          </div>
          <div className="steps">
            <article>
              <span className="step-number">01</span>
              <span className="step-icon">↗</span>
              <h3>Share what you need</h3>
              <p>
                Tell your community what would help. You choose what to share.
              </p>
            </article>
            <article>
              <span className="step-number">02</span>
              <span className="step-icon">✳</span>
              <h3>Find a connection</h3>
              <p>
                See nearby offers that align, with a clear explanation of every
                suggestion.
              </p>
            </article>
            <article>
              <span className="step-number">03</span>
              <span className="step-icon">♡</span>
              <h3>Make it happen</h3>
              <p>
                People confirm the details together. Every match needs human
                follow-through.
              </p>
            </article>
          </div>
        </section>
        <section className="closing wrap" id="about">
          <span className="closing-flower">✳</span>
          <div>
            <div className="section-kicker">THERE'S ROOM FOR EVERYONE</div>
            <h2>
              What can we do <em>for each other?</em>
            </h2>
          </div>
          <button className="primary" onClick={() => setDialog("offer")}>
            Offer a helping hand <Icon name="arrow" />
          </button>
          <button className="secondary" onClick={() => setAssistantOpen(true)}>Open the assistant</button>
        </section>
      </main>
      <footer className="footer">
        <div className="wrap footer-inner">
          <a href="#home" className="brand">
            <span className="brand-mark">
              <Icon name="heart" />
            </span>
            <span>
              hopeconnect<span className="green">.ai</span>
            </span>
          </a>
          <span>Built on the belief that community is a kind of care.</span>
          <span>© 2026 HopeConnect</span>
        </div>
        <div className="footer-note">
          Listings are stored in local MongoDB. Do not include private
          contact details or exact home addresses.
        </div>
      </footer>
      {profile && (
        <div className="profile-pop">
          <b>{user?.name}</b>
          <span>Local single-user dashboard</span>
          <button className="text-button" onClick={showMyPosts}>
            My posts
          </button>
        </div>
      )}
      {assistantOpen && <Assistant onClose={() => setAssistantOpen(false)} onCreated={(item) => { setItems((prev) => [item, ...prev]); setAssistantOpen(false); notify("Published to the community board."); }} />}
      {dialog && (
        <div
          className="overlay"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setDialog("");
          }}
        >
          <section
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
          >
            <button
              className="close"
              aria-label="Close"
              onClick={() => setDialog("")}
            >
              ×
            </button>
            <div className="section-kicker">
              {dialog === "need" ? "ASK YOUR COMMUNITY" : "SHARE WHAT YOU CAN"}
            </div>
            <h2 id="dialog-title">
              {dialog === "need"
                ? "What would help right now?"
                : "What can you offer?"}
            </h2>
            <p className="dialog-intro">
              Keep details broad. Your listing will be saved to your local board.
            </p>
            <form onSubmit={submitItem}>
              <label>
                Give it a short title
                <input
                  name="title"
                  required
                  maxLength="90"
                  placeholder={
                    dialog === "need"
                      ? "e.g. Groceries for a family"
                      : "e.g. Fresh groceries to share"
                  }
                />
              </label>
              <label>
                Tell us a little more
                <span className="textarea-wrap">
                  <textarea
                    id="description"
                    name="description"
                    required
                    maxLength="500"
                    rows="4"
                    placeholder="What would be useful for people to know?"
                  />
                  <button
                    type="button"
                    className="mic-button"
                    title="Use voice input"
                    aria-label="Use voice input"
                    onClick={startSpeech}
                  >
                    {speech ? "●" : "🎙"}
                  </button>
                </span>
                <button type="button" className="assistant-action" onClick={structureDescription}>
                  ✳ Structure this description
                </button>
              </label>
              <div className="form-two">
                <label>
                  Category
                  <select name="category">
                    {categories.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Area or city
                  <input
                    name="location"
                    required
                    maxLength="80"
                    placeholder="e.g. Pune"
                  />
                </label>
              </div>
              <div className="form-two">
                <label>
                  Urgency
                  <select name="urgency">
                    <option>Normal</option>
                    <option>High</option>
                    <option>Critical</option>
                  </select>
                </label>
                <label>
                  Quantity
                  <input
                    name="quantity"
                    type="number"
                    min="1"
                    max="100000"
                    defaultValue="1"
                    required
                  />
                </label>
              </div>
              <label className="upload-label">
                Supporting image{" "}
                <span className="optional">OPTIONAL · NOT ANALYZED</span>
                <input
                  name="image"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={() =>
                    notify(
                      "Image attachments are not enabled here. Describe the item in text instead.",
                    )
                  }
                />
                <small>
                  For privacy, this form does not upload or analyze images.
                </small>
              </label>
              <button className="primary submit" type="submit">
                {dialog === "need"
                  ? "Post this request"
                  : "Share this resource"}{" "}
                <Icon name="arrow" />
              </button>
              <p className="privacy">
                Please don't add phone numbers, emails or exact home addresses.
              </p>
            </form>
          </section>
        </div>
      )}
      {toast && (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </>
  );
}
