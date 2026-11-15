import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import Whiteboard from "./whiteboard/Whiteboard.jsx";

const API_URL = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL;

async function request(path, token, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || `Request failed (${response.status})`);
  return data;
}

function mergeMessages(current, incoming) {
  const byId = new Map(current.map((message) => [String(message._id), message]));
  incoming.forEach((message) => byId.set(String(message._id), message));
  return [...byId.values()].sort(
    (first, second) => new Date(first.createdAt) - new Date(second.createdAt),
  );
}

function userIdOf(value) {
  return String(value?._id || value?.id || value || "");
}

function Icon({ name, size = 18 }) {
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

  if (name === "video") {
    return <svg {...shared}><rect x="3" y="6" width="13" height="12" rx="2" /><path d="m16 10 5-3v10l-5-3" /></svg>;
  }
  if (name === "mic") {
    return <svg {...shared}><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3m-4 0h8" /></svg>;
  }
  if (name === "phone") {
    return <svg {...shared}><path d="M7 3H4a1 1 0 0 0-1 1c0 9.4 7.6 17 17 17a1 1 0 0 0 1-1v-3l-5-2-2 2a14 14 0 0 1-6-6l2-2-3-6Z" /></svg>;
  }
  return <svg {...shared}><path d="m5 12 4 4L19 6" /></svg>;
}

export default function MeetingRoom({ meetingId, code, token, user, onExit }) {
  const [meeting, setMeeting] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [connection, setConnection] = useState("connecting");
  const [peerConnected, setPeerConnected] = useState(false);
  const [connectoAvailable, setConnectoAvailable] = useState(false);
  const [error, setError] = useState("");
  const [mediaError, setMediaError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [callStatus, setCallStatus] = useState("idle");
  const [hasLocalVideo, setHasLocalVideo] = useState(false);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [remoteCameraEnabled, setRemoteCameraEnabled] = useState(false);
  const [remoteMicrophoneEnabled, setRemoteMicrophoneEnabled] = useState(true);
  const [activePanel, setActivePanel] = useState("video");
  const socketRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const mediaStatusChannelRef = useRef(null);
  const mediaStatusRef = useRef({ microphone: true, camera: true });
  const localStreamRef = useRef(null);
  const pendingOfferRef = useRef(null);
  const pendingCandidatesRef = useRef([]);
  const leaveTimerRef = useRef(null);
  const messagesEndRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      request(`/api/meeting/getdetailsofmeeting/${meetingId}`, token),
      request(`/api/meeting/message/${meetingId}`, token),
    ])
      .then(([details, history]) => {
        if (!active) return;
        setMeeting(details.meeting);
        setMessages((current) => mergeMessages(current, history.message || []));
      })
      .catch((requestError) => {
        if (active) setError(requestError.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [meetingId, token]);

  function closeCall(notifyPeer = false) {
    if (notifyPeer) {
      socketRef.current?.emit("webrtc-hangup", { meetingId });
    }
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    mediaStatusChannelRef.current?.close();
    mediaStatusChannelRef.current = null;
    mediaStatusRef.current = { microphone: true, camera: true };
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    pendingOfferRef.current = null;
    pendingCandidatesRef.current = [];
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    setHasLocalVideo(false);
    setRemoteCameraEnabled(false);
    setRemoteMicrophoneEnabled(true);
    setMicrophoneEnabled(true);
    setCameraEnabled(true);
    setCallStatus("idle");
  }

  async function getLocalStream() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Video calling requires a secure connection and a supported browser.");
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    localStreamRef.current = stream;
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    setHasLocalVideo(true);
    return stream;
  }

  function sendMediaStatus() {
    const channel = mediaStatusChannelRef.current;
    if (!channel || channel.readyState !== "open") return;
    channel.send(JSON.stringify({
      type: "media-status",
      ...mediaStatusRef.current,
    }));
  }

  function receiveMediaStatus({ data } = {}) {
    if (typeof data !== "string" || data.length > 128) {
      setMediaError("Could not sync microphone and camera status.");
      return;
    }
    let status;
    try {
      status = JSON.parse(data);
    } catch (parseError) {
      if (parseError instanceof SyntaxError) {
        setMediaError("Could not sync microphone and camera status.");
        return;
      }
      throw parseError;
    }
    if (status?.type !== "media-status" ||
        typeof status.microphone !== "boolean" ||
        typeof status.camera !== "boolean") {
      setMediaError("Could not sync microphone and camera status.");
      return;
    }
    setMediaError("");
    setRemoteMicrophoneEnabled(status.microphone);
    setRemoteCameraEnabled(status.camera);
  }

  function attachMediaStatusChannel(channel) {
    if (channel.label !== "konnecto-media-status") {
      channel.close();
      return;
    }
    mediaStatusChannelRef.current = channel;
    channel.onopen = sendMediaStatus;
    channel.onmessage = receiveMediaStatus;
    channel.onclose = () => {
      if (mediaStatusChannelRef.current === channel) {
        mediaStatusChannelRef.current = null;
      }
    };
    channel.onerror = () => {
      setMediaError("Microphone and camera status sharing was interrupted.");
    };
  }

  function createPeerConnection(isCaller = false) {
    const peer = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    peerConnectionRef.current = peer;

    localStreamRef.current?.getTracks().forEach((track) => {
      peer.addTrack(track, localStreamRef.current);
    });
    peer.onicecandidate = ({ candidate }) => {
      if (candidate) {
        socketRef.current?.emit("webrtc-ice-candidate", {
          meetingId,
          candidate: candidate.toJSON(),
        });
      }
    };
    peer.ontrack = ({ streams, track }) => {
      if (!remoteVideoRef.current) return;
      if (streams[0]) {
        remoteVideoRef.current.srcObject = streams[0];
      } else {
        const remoteStream = remoteVideoRef.current.srcObject || new MediaStream();
        remoteStream.addTrack(track);
        remoteVideoRef.current.srcObject = remoteStream;
      }
      if (track.kind === "video") {
        setRemoteCameraEnabled(true);
        track.onmute = () => setRemoteCameraEnabled(false);
        track.onunmute = () => setRemoteCameraEnabled(true);
        track.onended = () => setRemoteCameraEnabled(false);
      } else if (track.kind === "audio") {
        setRemoteMicrophoneEnabled(true);
        track.onmute = () => setRemoteMicrophoneEnabled(false);
        track.onunmute = () => setRemoteMicrophoneEnabled(true);
        track.onended = () => setRemoteMicrophoneEnabled(false);
      }
      setCallStatus("connected");
    };
    peer.ondatachannel = ({ channel }) => attachMediaStatusChannel(channel);
    if (isCaller) {
      let channel;
      try {
        channel = peer.createDataChannel("konnecto-media-status");
      } catch (channelError) {
        setMediaError(channelError.message || "Device status sharing is unavailable; the video call can continue.");
      }
      if (channel) attachMediaStatusChannel(channel);
    }
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "failed") {
        closeCall(false);
        setCallStatus("failed");
        setMediaError("The video connection failed. Try ending the call and reconnecting.");
      }
    };
    return peer;
  }

  async function addPendingCandidates(peer) {
    const candidates = pendingCandidatesRef.current;
    pendingCandidatesRef.current = [];
    for (const candidate of candidates) {
      await peer.addIceCandidate(candidate);
    }
  }

  async function startVideoCall() {
    if (!canStartVideoCall || (callStatus !== "idle" && callStatus !== "failed")) return;
    setMediaError("");
    setCallStatus("calling");
    try {
      await getLocalStream();
      const peer = createPeerConnection(true);
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      socketRef.current?.emit("webrtc-offer", {
        meetingId,
        offer: peer.localDescription.toJSON(),
      });
    } catch (callError) {
      closeCall(false);
      setMediaError(callError.message || "Could not start the video call.");
    }
  }

  async function acceptVideoCall() {
    const offer = pendingOfferRef.current;
    if (!offer) return;
    setMediaError("");
    setCallStatus("connecting");
    try {
      await getLocalStream();
      const peer = createPeerConnection();
      await peer.setRemoteDescription(offer);
      await addPendingCandidates(peer);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      socketRef.current?.emit("webrtc-answer", {
        meetingId,
        answer: peer.localDescription.toJSON(),
      });
      pendingOfferRef.current = null;
    } catch (callError) {
      closeCall(false);
      setMediaError(callError.message || "Could not accept the video call.");
    }
  }

  useEffect(() => {
    let active = true;
    const socket = io(SOCKET_URL, {
      path: "/socket.io",
      auth: { token },
      withCredentials: true,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      if (!active) return;
      setConnection("joining");
      socket.emit("join-meeting", { meetingId });
    });
    socket.on("joined-meeting", ({ peerConnected: isPeerConnected } = {}) => {
      if (active) {
        setConnection("connected");
        setPeerConnected(Boolean(isPeerConnected));
        setError("");
      }
    });
    socket.on("participant-presence", ({ connected: isPeerConnected } = {}) => {
      if (!active) return;
      setPeerConnected(Boolean(isPeerConnected));
      if (isPeerConnected) {
        request(`/api/meeting/getdetailsofmeeting/${meetingId}`, token)
          .then((data) => {
            if (active) setMeeting(data.meeting);
          })
          .catch((requestError) => {
            if (active) setError(requestError.message);
          });
      }
    });
    socket.on("connecto:availability", ({ meetingId: boardMeetingId, available, reason } = {}) => {
      if (!active || boardMeetingId !== meetingId) return;
      setConnectoAvailable(Boolean(available));
      if (available) setPeerConnected(true);
      else setPeerConnected(false);
      if (reason === "meeting-ended") {
        setMeeting((current) => current ? { ...current, status: "Ended" } : current);
        closeCall(false);
      }
    });
    socket.on("receive-message", (message) => {
      if (active) setMessages((current) => mergeMessages(current, [message]));
    });
    socket.on("webrtc-offer", ({ offer } = {}) => {
      if (!active || peerConnectionRef.current) return;
      pendingOfferRef.current = offer;
      setCallStatus("incoming");
    });
    socket.on("webrtc-answer", async ({ answer } = {}) => {
      const peer = peerConnectionRef.current;
      if (!active || !peer || !answer) return;
      try {
        await peer.setRemoteDescription(answer);
        await addPendingCandidates(peer);
        setCallStatus("connecting");
      } catch (callError) {
        setMediaError(callError.message || "Could not connect the video call.");
        closeCall(false);
      }
    });
    socket.on("webrtc-ice-candidate", async ({ candidate } = {}) => {
      if (!active || !candidate) return;
      const peer = peerConnectionRef.current;
      if (!peer?.remoteDescription) {
        pendingCandidatesRef.current.push(candidate);
        return;
      }
      try {
        await peer.addIceCandidate(candidate);
      } catch (callError) {
        setMediaError(callError.message || "Could not establish the video connection.");
      }
    });
    socket.on("webrtc-hangup", () => {
      if (active) closeCall(false);
    });
    socket.on("webrtc-error", (payload = {}) => {
      if (!active) return;
      closeCall(false);
      setMediaError(payload.message || "Could not start the video call.");
    });
    socket.on("error-message", (payload = {}) => {
      if (active) setError(payload.message || "Meeting socket error.");
    });
    socket.on("connect_error", (socketError) => {
      if (active) {
        setConnection("error");
        setError(socketError.message || "Could not connect to meeting chat.");
        setConnectoAvailable(false);
      }
    });
    socket.on("disconnect", () => {
      if (active) {
        setConnection("disconnected");
        setPeerConnected(false);
        setConnectoAvailable(false);
        closeCall(false);
      }
    });

    return () => {
      active = false;
      if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
      socket.emit("webrtc-hangup", { meetingId });
      socket.emit("leave-meeting", { meetingId });
      socket.disconnect();
      closeCall(false);
      setPeerConnected(false);
      socketRef.current = null;
    };
  }, [meetingId, token]);

  useEffect(() => {
    const refreshMeeting = async () => {
      try {
        const data = await request(`/api/meeting/getdetailsofmeeting/${meetingId}`, token);
        setMeeting(data.meeting);
      } catch (requestError) {
        setError(requestError.message);
      }
    };
    const timer = setInterval(refreshMeeting, 5000);
    return () => clearInterval(timer);
  }, [meetingId, token]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (meeting?.status === "Ended") closeCall(false);
  }, [meeting?.status]);

  const hostId = userIdOf(meeting?.host);
  const isHost = hostId && hostId === userIdOf(user);
  const participants = meeting?.participants || [];
  const canChat = connection === "connected" && meeting?.status === "Active" && participants.length >= 2;
  const canStartVideoCall = isHost && canChat && peerConnected;
  const boardAvailable = Boolean(
    socketRef.current &&
    connection === "connected" &&
    connectoAvailable &&
    meeting?.status === "Active",
  );

  useEffect(() => {
    if (connection === "connected" && peerConnected && meeting?.status === "Active") {
      socketRef.current?.emit("connecto:join", { meetingId });
    } else {
      setConnectoAvailable(false);
    }
  }, [connection, peerConnected, meeting?.status, meetingId]);

  useEffect(() => {
    if (boardAvailable) setActivePanel("connecto");
    else setActivePanel((current) => current === "connecto" ? "video" : current);
  }, [boardAvailable]);

  function sendMessage(event) {
    event.preventDefault();
    const cleanText = text.trim();
    if (!cleanText || cleanText.length > 2000 || !canChat) return;
    setError("");
    socketRef.current?.emit("send-message", { meetingId, text: cleanText });
    setText("");
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Could not copy the meeting code. Please select and copy it instead.");
    }
  }

  function leaveMeeting() {
    const socket = socketRef.current;
    if (!socket?.connected) {
      closeCall(false);
      onExit();
      return;
    }

    setBusy(true);
    closeCall(false);
    const finishLeaving = () => {
      if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
      onExit();
    };
    socket.once("left-meeting", finishLeaving);
    socket.emit("leave-meeting", { meetingId });
    leaveTimerRef.current = setTimeout(finishLeaving, 2000);
  }

  async function endMeeting() {
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      await request(`/api/meeting/end/${meetingId}`, token, { method: "PATCH" });
      closeCall(true);
      setMeeting((current) => current ? { ...current, status: "Ended" } : current);
      onExit();
    } catch (requestError) {
      setError(requestError.message);
      setBusy(false);
    }
  }

  function toggleMicrophone() {
    const nextEnabled = !microphoneEnabled;
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = nextEnabled;
    });
    mediaStatusRef.current = { ...mediaStatusRef.current, microphone: nextEnabled };
    setMicrophoneEnabled(nextEnabled);
    sendMediaStatus();
  }

  function toggleCamera() {
    const nextEnabled = !cameraEnabled;
    localStreamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = nextEnabled;
    });
    mediaStatusRef.current = { ...mediaStatusRef.current, camera: nextEnabled };
    setCameraEnabled(nextEnabled);
    sendMediaStatus();
  }

  const otherParticipant = participants.find(
    (participant) => userIdOf(participant) !== userIdOf(user),
  );
  const activeParticipantCount = (connection === "connected" ? 1 : 0) + (peerConnected ? 1 : 0);
  const callLabel = callStatus === "incoming"
    ? "Incoming video call"
    : callStatus === "connected"
      ? "Video connected"
      : callStatus === "calling" || callStatus === "connecting"
        ? "Connecting video…"
        : callStatus === "failed"
          ? "Call connection failed"
          : "Ready when you are";

  return (
    <div className="room-page">
      <header className="room-topbar">
        <div className="room-title">
          <span className={`connection-dot connection-${connection}`} />
          <div>
            <p className="eyebrow">{isHost ? "HOSTING" : "IN A MEETING"}</p>
            <h1>Meeting room</h1>
          </div>
        </div>
        <div className="room-top-actions">
          <button className="room-code" onClick={copyCode} title="Copy meeting code">
            <span>{copied ? "COPIED" : "MEETING CODE"}</span><strong>{code}</strong>
          </button>
          {isHost && meeting?.status === "Active" && (
            <button className="button button-danger" onClick={endMeeting} disabled={busy}>End meeting</button>
          )}
          <button className="button button-outline" onClick={leaveMeeting} disabled={busy}>
            {meeting?.status === "Ended" ? "Back to dashboard" : "Leave"}
          </button>
        </div>
      </header>

      <nav className="room-tabs" role="tablist" aria-label="Meeting workspace">
        <button
          type="button"
          className={activePanel === "video" ? "room-tab-active" : ""}
          onClick={() => setActivePanel("video")}
          role="tab"
          aria-selected={activePanel === "video"}
        >Video</button>
        {boardAvailable && (
          <button
            type="button"
            className={activePanel === "connecto" ? "room-tab-active" : ""}
            onClick={() => setActivePanel((current) => current === "connecto" ? "video" : "connecto")}
            role="tab"
            aria-selected={activePanel === "connecto"}
          >CONNECTO</button>
        )}
        <button
          type="button"
          className={`room-tab-chat ${activePanel === "chat" ? "room-tab-active" : ""}`}
          onClick={() => setActivePanel("chat")}
          role="tab"
          aria-selected={activePanel === "chat"}
        >Chat</button>
      </nav>

      <div className={`room-layout room-view-${activePanel} ${boardAvailable && activePanel === "connecto" ? "room-layout-collaboration" : ""}`}>
        <div className="room-stage">
        <section className="video-stage" aria-label="Video call">
          <div className="video-stage-heading">
            <div>
              <p className="eyebrow">VIDEO MEETING</p>
              <h2>{callLabel}</h2>
            </div>
            <span className={`socket-status socket-${connection}`}>
              {connection === "connected" ? "Live room" : connection === "joining" ? "Joining…" : connection === "connecting" ? "Connecting…" : "Reconnecting"}
            </span>
          </div>
          <div className="video-grid">
            <article className={`video-tile remote-video-tile ${callStatus === "connected" && remoteCameraEnabled ? "video-live" : ""}`}>
              <video ref={remoteVideoRef} autoPlay playsInline aria-label="Other participant video" />
              {callStatus === "connected" && (
                <div className="video-device-indicators">
                  <span className={`video-device-indicator ${remoteMicrophoneEnabled ? "" : "video-device-off"}`} role="img" aria-label={`Microphone ${remoteMicrophoneEnabled ? "on" : "off"}`}><Icon name="mic" size={14} /></span>
                  <span className={`video-device-indicator ${remoteCameraEnabled ? "" : "video-device-off"}`} role="img" aria-label={`Camera ${remoteCameraEnabled ? "on" : "off"}`}><Icon name="video" size={14} /></span>
                </div>
              )}
              {(callStatus !== "connected" || !remoteCameraEnabled) && (
                <div className="video-placeholder">
                  <span className="video-avatar">{(otherParticipant?.name || "G").slice(0, 1).toUpperCase()}</span>
                  <strong>{otherParticipant?.name || "Your guest"}</strong>
                  <p>{!peerConnected ? "Waiting for someone to join" : callStatus === "incoming" ? "Ready to join your call" : callStatus === "connected" ? "Camera is off" : "Video will appear here"}</p>
                </div>
              )}
              <span className="video-name">{otherParticipant?.name || "Guest"}</span>
            </article>
            <article className={`video-tile local-video-tile ${hasLocalVideo && cameraEnabled ? "video-live" : ""}`}>
              <video ref={localVideoRef} autoPlay muted playsInline aria-label="Your video" />
              {callStatus === "connected" && (
                <div className="video-device-indicators">
                  <span className={`video-device-indicator ${microphoneEnabled ? "" : "video-device-off"}`} role="img" aria-label={`Microphone ${microphoneEnabled ? "on" : "off"}`}><Icon name="mic" size={14} /></span>
                  <span className={`video-device-indicator ${cameraEnabled ? "" : "video-device-off"}`} role="img" aria-label={`Camera ${cameraEnabled ? "on" : "off"}`}><Icon name="video" size={14} /></span>
                </div>
              )}
              {(!hasLocalVideo || !cameraEnabled) && (
                <div className="video-placeholder">
                  <span className="video-avatar local-avatar">{(user?.name || "Y").slice(0, 1).toUpperCase()}</span>
                  <strong>You</strong>
                  <p>{callStatus === "incoming" ? "Accept to turn on your camera" : cameraEnabled ? "Your camera is off" : "Camera is off"}</p>
                </div>
              )}
              <span className="video-name">You</span>
            </article>
          </div>
          <div className="video-controls">
            {callStatus === "incoming" ? (
              <button className="button button-dark call-primary" onClick={acceptVideoCall}>
                <Icon name="video" /> Accept video call
              </button>
            ) : callStatus === "idle" || callStatus === "failed" ? (
              <button className="button button-dark call-primary" onClick={startVideoCall} disabled={!canStartVideoCall}>
                <Icon name="video" /> {isHost ? "Start video call" : "Waiting for host"}
              </button>
            ) : (
              <>
                <button className={`control-button ${microphoneEnabled ? "" : "control-muted"}`} onClick={toggleMicrophone} aria-pressed={microphoneEnabled} aria-label={microphoneEnabled ? "Mute microphone" : "Unmute microphone"}>
                  <Icon name="mic" /> <span>{microphoneEnabled ? "Mute" : "Unmute"}</span>
                </button>
                <button className={`control-button ${cameraEnabled ? "" : "control-muted"}`} onClick={toggleCamera} aria-pressed={cameraEnabled} aria-label={cameraEnabled ? "Turn camera off" : "Turn camera on"}>
                  <Icon name="video" /> <span>{cameraEnabled ? "Camera off" : "Camera on"}</span>
                </button>
                <button className="control-button control-hangup" onClick={() => closeCall(true)} aria-label="End video call">
                  <Icon name="phone" /> <span>End call</span>
                </button>
              </>
            )}
          </div>
          {meeting?.status === "Active" && (!canChat || (isHost && !peerConnected)) && (
            <p className="video-hint">
              {participants.length < 2
                ? "Share the meeting code to invite your guest."
                : !canChat
                  ? "Connecting to the meeting room…"
                  : "Waiting for your guest to connect before starting the call."}
            </p>
          )}
          {mediaError && <p className="media-error" role="alert">{mediaError}</p>}
        </section>
        {boardAvailable && socketRef.current && (
          <Whiteboard
            meetingId={meetingId}
            socket={socketRef.current}
            user={user}
            participants={participants}
          />
        )}
        </div>

        <aside className="room-sidebar">
          <section className="conversation-panel">
            <div className="conversation-header">
              <div>
                <p className="eyebrow">LIVE CONVERSATION</p>
                <h2>Messages</h2>
              </div>
              <span className={`socket-status socket-${connection}`}>
                {connection === "connected" ? "Connected" : connection === "joining" ? "Joining…" : connection === "connecting" ? "Connecting…" : "Disconnected"}
              </span>
            </div>
            <div className="message-list" aria-live="polite">
              {loading ? (
                <p className="empty-chat">Loading meeting…</p>
              ) : messages.length ? messages.map((message) => {
                const ownMessage = userIdOf(message.sender) === userIdOf(user);
                return (
                  <article className={`message ${ownMessage ? "message-own" : ""}`} key={message._id}>
                    <div className="message-avatar">{(message.sendername || "?").slice(0, 1).toUpperCase()}</div>
                    <div className="message-body">
                      <div className="message-meta">
                        <strong>{ownMessage ? "You" : message.sendername || "Participant"}</strong>
                        <time>{message.createdAt ? new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}</time>
                      </div>
                      <p>{message.text}</p>
                    </div>
                  </article>
                );
              }) : (
                <div className="empty-chat">
                  <span>✦</span>
                  <strong>Your conversation starts here</strong>
                  <p>Messages sent in this meeting will appear here.</p>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
            {meeting?.status === "Ended" ? (
              <div className="chat-notice">The host ended this meeting.</div>
            ) : participants.length < 2 ? (
              <div className="chat-notice">Waiting for the other participant to join before chat is available.</div>
            ) : null}
            <form className="message-form" onSubmit={sendMessage}>
              <label className="visually-hidden" htmlFor="chat-message">Message</label>
              <input id="chat-message" value={text} onChange={(event) => setText(event.target.value)} placeholder="Write a message…" maxLength={2000} disabled={!canChat} />
              <button className="button button-dark" type="submit" disabled={!canChat || !text.trim()}>Send</button>
            </form>
          </section>

          <section className="room-card">
            <p className="eyebrow">IN THIS MEETING</p>
            <h2>{activeParticipantCount} of 2 connected</h2>
            <div className="participant-list">
              {participants.map((participant) => {
                const participantId = userIdOf(participant);
                const participantIsHost = participantId === hostId;
                const participantIsOnline = meeting?.status === "Active" && (
                  participantId === userIdOf(user)
                    ? connection === "connected"
                    : peerConnected
                );
                return (
                  <div className="participant-row" key={participantId}>
                    <span className="participant-avatar">{(participant.name || "?").slice(0, 1).toUpperCase()}</span>
                    <span className="participant-name"><strong>{participant.name || "Participant"}</strong><small>{participantIsHost ? "Host" : "Participant"}{participantId === userIdOf(user) ? " · You" : ""}</small></span>
                    <span className={`participant-online ${participantIsOnline ? "" : "participant-offline"}`} title={participantIsOnline ? "In meeting" : "Disconnected"} />
                  </div>
                );
              })}
              {!peerConnected && meeting?.status === "Active" && <div className="waiting-row"><span />Waiting for someone to join</div>}
            </div>
          </section>
          {error && <div className="room-error" role="alert">{error}</div>}
        </aside>
      </div>
    </div>
  );
}