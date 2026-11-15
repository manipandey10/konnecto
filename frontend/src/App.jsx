import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import MeetingRoom from "./MeetingRoom.jsx";

const TOKEN_KEY = "gather-token";
const API_URL = (import.meta.env.PROD ? import.meta.env.VITE_API_URL || "" : "").replace(/\/$/, "");

async function request(path, { token, ...options } = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || `Request failed (${response.status})`);
  }
  return data;
}

function Icon({ name, size = 20 }) {
  const shared = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };

  if (name === "arrow") {
    return <svg {...shared}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
  }
  if (name === "plus") {
    return <svg {...shared}><path d="M12 5v14M5 12h14" /></svg>;
  }
  if (name === "users") {
    return <svg {...shared}><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
  }
  if (name === "copy") {
    return <svg {...shared}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></svg>;
  }
  if (name === "video") {
    return <svg {...shared}><rect x="3" y="6" width="13" height="12" rx="2" /><path d="m16 10 5-3v10l-5-3" /></svg>;
  }
  return <svg {...shared}><path d="M12 3 2.5 20h19L12 3Z" /><path d="M12 9v4m0 3h.01" /></svg>;
}

function Brand() {
  return (
    <a className="brand" href="/" aria-label="KONNECTO home">
      <span className="brand-mark"><span /><span /><span /></span>
      <span>KONNECTO<span className="brand-period">.</span></span>
    </a>
  );
}

function Notice({ tone = "error", children, onClose }) {
  if (!children) return null;
  return (
    <div className={`notice notice-${tone}`} role={tone === "error" ? "alert" : "status"}>
      <span>{children}</span>
      {onClose && <button className="notice-close" onClick={onClose} aria-label="Dismiss">×</button>}
    </div>
  );
}

function AuthPanel({ onAuthenticated }) {
  const [mode, setMode] = useState("login");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const password = form.get("password");
    const payload = mode === "register"
      ? {
          name: String(form.get("name")).trim(),
          email: String(form.get("email")).trim(),
          password,
        }
      : {
          [String(form.get("identifier")).includes("@") ? "email" : "name"]:
            String(form.get("identifier")).trim(),
          password,
        };

    try {
      const data = await request(
        mode === "register" ? "/api/user/create" : "/api/user/login",
        { method: "POST", body: JSON.stringify(payload) },
      );
      if (!data.token) throw new Error("Authentication response did not include a token.");
      sessionStorage.setItem(TOKEN_KEY, data.token);
      const profile = await request("/api/user/getme", { token: data.token });
      onAuthenticated(profile.user);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="auth-card" aria-labelledby="auth-heading">
      <div className="auth-tabs" role="tablist" aria-label="Account options">
        <button className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setError(""); }} role="tab" aria-selected={mode === "login"}>Sign in</button>
        <button className={mode === "register" ? "active" : ""} onClick={() => { setMode("register"); setError(""); }} role="tab" aria-selected={mode === "register"}>Create account</button>
      </div>
      <div className="auth-content">
        <p className="eyebrow">{mode === "login" ? "WELCOME BACK" : "GET STARTED"}</p>
        <h2 id="auth-heading">{mode === "login" ? "Sign in to KONNECTO" : "Your next conversation starts here"}</h2>
        <p className="auth-subtitle">
          {mode === "login" ? "Pick up where your team left off." : "Create an account to host or join a meeting."}
        </p>
        <Notice>{error}</Notice>
        <form className="auth-form" onSubmit={submit}>
          {mode === "register" ? (
            <>
              <label htmlFor="name">Name</label>
              <input id="name" name="name" autoComplete="name" placeholder="Your name" required />
              <label htmlFor="email">Email address</label>
              <input id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required />
            </>
          ) : (
            <>
              <label htmlFor="identifier">Email or name</label>
              <input id="identifier" name="identifier" autoComplete="username" placeholder="you@example.com" required />
            </>
          )}
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="Enter your password" required />
          <button className="button button-dark auth-submit" type="submit" disabled={busy}>
            {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
            {!busy && <Icon name="arrow" size={18} />}
          </button>
        </form>
      </div>
    </section>
  );
}

function Dashboard({ user, token, onEnterMeeting }) {
  const [busy, setBusy] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState("");

  async function createMeeting() {
    setError("");
    setBusy(true);
    try {
      const data = await request("/api/meeting/create", {
        method: "POST",
        token,
        body: JSON.stringify({}),
      });
      onEnterMeeting({ meetingId: data.meeting._id, code: data.meeting.code });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function joinMeeting(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const data = await request("/api/meeting/join", {
        method: "POST",
        token,
        body: JSON.stringify({ code: joinCode.trim() }),
      });
      onEnterMeeting({ meetingId: data.meetingId, code: joinCode.trim().toUpperCase() });
      setJoinCode("");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dashboard">
      <div className="dashboard-heading">
        <div>
          <p className="eyebrow">YOUR WORKSPACE</p>
          <h1>Good to see you, {user?.name || "there"}.</h1>
          <p className="muted">Make space for a good conversation.</p>
        </div>
        <span className="avatar" aria-hidden="true">{(user?.name || "G").slice(0, 1).toUpperCase()}</span>
      </div>
      <Notice>{error}</Notice>

      <div className="action-grid">
        <section className="action-card create-card">
          <div className="action-icon"><Icon name="plus" size={23} /></div>
          <p className="eyebrow">HOST A MEETING</p>
          <h2>Start something together.</h2>
          <p className="action-description">Create a room and invite one person with its meeting code.</p>
          <button className="button button-dark" onClick={createMeeting} disabled={busy}>
            {busy ? "Working…" : "Create meeting"} {!busy && <Icon name="arrow" size={18} />}
          </button>
        </section>
        <section className="action-card join-card">
          <div className="action-icon action-icon-light"><Icon name="users" size={22} /></div>
          <p className="eyebrow">JOIN A MEETING</p>
          <h2>Have a code?</h2>
          <p className="action-description">Enter a meeting code to join the room.</p>
          <form className="join-form" onSubmit={joinMeeting}>
            <label className="visually-hidden" htmlFor="meeting-code">Meeting code</label>
            <input id="meeting-code" value={joinCode} onChange={(event) => setJoinCode(event.target.value)} placeholder="Enter meeting code" autoCapitalize="characters" required />
            <button className="button button-outline" disabled={busy || !joinCode.trim()} type="submit">
              Join <Icon name="arrow" size={18} />
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY) || "");
  const [activeMeeting, setActiveMeeting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const mainRef = useRef(null);

  useEffect(() => {
    let active = true;
    if (!token) {
      setLoading(false);
      return () => { active = false; };
    }

    request("/api/user/getme", { token })
      .then((data) => {
        if (active) setUser(data.user);
      })
      .catch((requestError) => {
        if (!active) return;
        if (/TOKEN IS REQUIRED|TOKEN IS BLACKLISTED|TOKEN IS INVALID|INVALID USER|USER IS NOT FOUND/i.test(requestError.message)) {
          sessionStorage.removeItem(TOKEN_KEY);
          setToken("");
          setError("Your session expired. Please sign in again.");
          return;
        }
        setError(requestError.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (loading || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const context = gsap.context(() => {
      if (!user) {
        gsap.from(".welcome-copy > *, .auth-column", {
          autoAlpha: 0,
          y: 20,
          duration: 0.65,
          stagger: 0.08,
          ease: "power2.out",
        });
      } else if (activeMeeting) {
        gsap.from(".room-topbar, .video-stage, .conversation-panel, .room-card", {
          autoAlpha: 0,
          y: 18,
          duration: 0.55,
          stagger: 0.08,
          ease: "power2.out",
        });
      } else {
        gsap.from(".dashboard-heading, .action-card", {
          autoAlpha: 0,
          y: 18,
          duration: 0.55,
          stagger: 0.08,
          ease: "power2.out",
        });
      }
    }, mainRef);
    return () => context.revert();
  }, [loading, user, activeMeeting]);

  function authenticated(nextUser) {
    const nextToken = sessionStorage.getItem(TOKEN_KEY) || "";
    setToken(nextToken);
    setUser(nextUser);
    setError("");
  }

  async function logout() {
    setError("");
    try {
      await request("/api/user/logout", { method: "GET", token });
      sessionStorage.removeItem(TOKEN_KEY);
      setToken("");
      setUser(null);
      setActiveMeeting(null);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  return (
    <div className={`app-shell ${!loading && !user ? "auth-shell" : ""}`}>
      <header className="topbar">
        <Brand />
        <div className="topbar-right">
          {user && <button className="logout-button" onClick={logout}>Sign out</button>}
        </div>
      </header>
      <main ref={mainRef}>
        {loading ? (
          <div className="loading-state"><span className="spinner" /> Getting your workspace ready…</div>
        ) : user ? (
          activeMeeting ? (
            <MeetingRoom
              key={activeMeeting.meetingId}
              meetingId={activeMeeting.meetingId}
              code={activeMeeting.code}
              token={token}
              user={user}
              onExit={() => setActiveMeeting(null)}
            />
          ) : (
            <Dashboard
              user={user}
              token={token}
              onEnterMeeting={setActiveMeeting}
            />
          )
        ) : (
          <div className="welcome-layout">
            <section className="welcome-copy">
              <p className="availability"><span /> VIDEO MEETINGS &amp; COLLABORATION</p>
              <h1>WELCOME<br />to KONNECTO<br /><em> WORLD</em></h1>
              <br></br>

              <div className="welcome-detail">
                <span className="detail-icon"><Icon name="users" size={20} /></span>
                <span><strong>Host or join with a meeting code.</strong><small>Developed BY MRP WORLD.</small></span>
              </div>
            </section>
            <div className="auth-column">
              {error && <Notice>{error}</Notice>}
              <AuthPanel onAuthenticated={authenticated} />
            </div>
          </div>
        )}
      </main>
      <footer className="footer">
        <span>© {new Date().getFullYear()} KONNECTO</span>
      </footer>
    </div>
  );
}