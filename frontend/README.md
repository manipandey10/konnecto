# KONNECTO frontend

## Run locally

1. Configure `backend/.env` with `MONGODB_URL`, `JWT_SECRET_KEY`, and `FRONTEND_URL=http://localhost:5173`. `PORT` is optional and defaults to `3000`.
2. In `backend`, run `npm install`, then `npm start`.
3. Copy `.env.example` to `.env` in `frontend`. Set `VITE_BACKEND_URL` to the backend origin if it is not `http://localhost:3000`.
4. In `frontend`, run `npm install`, then `npm run dev`.

The Vite development server proxies `/api` and `/socket.io` (including WebSocket upgrades) to `VITE_BACKEND_URL`; local API and socket requests use this proxy. In production, Express serves the Vite build and handles `/api` and `/socket.io` on the same origin. Leave `VITE_API_URL` and `VITE_SOCKET_URL` unset for this deployment. If the frontend is hosted separately, set both to the backend origin and set backend `FRONTEND_URL` to the frontend's exact origin. Credentialed cookies are enabled for that origin.

If an API request returns `Cannot POST /api/user/create`, check that the process listening on `VITE_BACKEND_URL` is KONNECTO's backend. If port `3000` is occupied by another local app, run KONNECTO with `PORT=3001` and set `VITE_BACKEND_URL=http://localhost:3001` before starting Vite.

## Docker deployment

From the project root, build and run the image:

```sh
docker build -t deployment-konnecto .
docker run --env-file backend/.env -p 5050:3000 deployment-konnecto
```

The env file is supplied at runtime rather than copied into the image. Configure `MONGODB_URL` and `JWT_SECRET_KEY` in it, or pass those variables through your deployment platform. The frontend is available at `http://localhost:5050`.

## Backend integration scope

The frontend uses the existing auth and meeting routes, loads meeting details/history through the existing meeting-ID routes, and reuses the authenticated meeting Socket.IO connection for chat, WebRTC signaling, and CONNECTO whiteboard events. Registration and login both return the token used by the client.

API requests prefer the per-tab Bearer token over the shared cookie. This matters when two accounts are used in different tabs of the same browser. The backend returns a meeting ID from both create and join responses so the client can load details/history and join the matching socket room.

The backend permits two participants. Its `leave-meeting` socket event only leaves the socket room; it does not remove that user from the persisted participant list or free the meeting slot. The host can end an active meeting through the existing end route.

Video uses browser WebRTC media and the authenticated `webrtc-offer`, `webrtc-answer`, `webrtc-ice-candidate`, and `webrtc-hangup` socket events. The existing peer connection also negotiates a small data channel for camera and microphone status indicators; it does not create another socket connection. The backend relays signaling only to other sockets in an active meeting room and does not store media. Camera and microphone access require user permission and a secure context (HTTPS, or localhost). The client currently uses a public STUN server; production deployments that need reliable connections across restrictive NATs should configure a TURN service.

CONNECTO opens when two distinct authenticated meeting participants are connected to the active room. It synchronizes pen and eraser strokes, text, shapes, cursors, and per-user undo/redo over the existing meeting socket. On large screens it sits beside the video cards; narrower screens switch between Video, CONNECTO, and Chat.

Whiteboard operations live only in a backend in-memory session keyed by meeting ID. They are never stored in MongoDB, localStorage, or sessionStorage. Leaving with the meeting's Leave control disables the board immediately; the session is deleted when the last participant leaves or the host ends the meeting. Unexpected disconnects retain the in-memory session for up to 20 seconds to allow reconnection; a returning participant in the still-active meeting receives the current board state.
