import { useEffect, useRef, useState } from "react";

const categories = ["Food", "Clothing", "Shelter", "Education", "Healthcare", "Other"];
const emptyDraft = { title: "", description: "", category: "Other", location: "", urgency: "Normal", quantity: 1 };

async function readApiResponse(response, fallback) {
  let body;
  try { body = await response.json(); }
  catch {
    if (!response.ok) throw new Error(`Request failed (HTTP ${response.status}). The API returned an unreadable response; check the API server and its logs.`);
    throw new Error("The API returned an unreadable response. Please retry.");
  }
  if (!response.ok) throw new Error(body?.error || fallback);
  return body;
}

export default function Assistant({ onClose, onCreated }) {
  const [kind, setKind] = useState("need");
  const [messages, setMessages] = useState([{ role: "assistant", text: "Tell me what support you need or what you can offer. I’ll help prepare a draft for you to review." }]);
  const [text, setText] = useState("");
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [media, setMedia] = useState(null);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [preview, setPreview] = useState("");
  const [captureKind, setCaptureKind] = useState("audio");
  const [progress, setProgress] = useState(0);
  const recorder = useRef(null), stream = useRef(null), timer = useRef(null), chunks = useRef([]), request = useRef(null), cancelled = useRef(false);
  const stopTracks = () => { stream.current?.getTracks().forEach((track) => track.stop()); stream.current = null; };
  useEffect(() => () => { clearInterval(timer.current); stopTracks(); request.current?.abort(); }, []);
  const add = (role, value) => setMessages((all) => [...all, { role, text: value }]);
  async function prepare(e) {
    e?.preventDefault();
    const prompt = text.trim(); if (prompt.length < 5) { setError("Please add a little more detail first."); return; }
    setBusy(true); setError(""); add("user", prompt); setText("");
    try {
      const response = await fetch("/api/ai/structure", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: prompt, kind }) });
      const body = await readApiResponse(response, "Could not prepare a draft.");
      setDraft({ ...emptyDraft, ...body.result, quantity: body.result.quantity ?? "", location: body.result.location ?? "", description: body.result.description || prompt });
      const followUp = body.result.missingFields?.length ? ` Please add: ${body.result.missingFields.join(" and ")}.` : "";
      add("assistant", `I prepared a ${kind === "need" ? "help request" : "resource offer"} using ${body.result.mode}. This is structurally validated, not fact-checked. Review every field.${followUp} Nothing is published yet.`);
    } catch (err) { setText(prompt); setError(err.message || "Assistant unavailable. You can still fill in a listing manually."); }
    finally { setBusy(false); }
  }
  async function publish(e) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch(`/api/entries/${kind}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...draft, quantity: Number(draft.quantity) }) });
      const body = await readApiResponse(response, "The listing could not be published.");
      add("assistant", "Your listing was saved to the community board."); onCreated(body.item); setDraft(null);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  function processMedia() {
    if (!media || media.previewStream) { setError("Record a clip or choose a media file before processing."); return; }
    setBusy(true); setProgress(0); setError("");
    const form = new FormData(); form.append("media", media, media.name || "recording.webm");
    const xhr = new XMLHttpRequest(); request.current = xhr; xhr.open("POST", "/api/assistant/media");
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) setProgress(Math.round(event.loaded / event.total * 100)); };
    xhr.onload = () => { try { const body = JSON.parse(xhr.responseText); if (xhr.status < 200 || xhr.status >= 300) throw new Error(body.error || "Media processing failed."); setText((previous) => [previous, body.transcript].filter(Boolean).join(" ")); add("assistant", "Transcript ready. Review and correct it in the text field before preparing a draft."); setMedia(null); if (preview && preview !== "live") URL.revokeObjectURL(preview); setPreview(""); setError(""); } catch (err) { setError(err.message); } finally { setBusy(false); request.current = null; } };
    xhr.onerror = () => { setError("Upload failed. Check the connection and retry."); setBusy(false); request.current = null; };
    xhr.onabort = () => { setError("Upload cancelled. The server removes temporary files after processing."); setBusy(false); request.current = null; };
    xhr.send(form);
  }
  function selectMedia(file) {
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) { setError("Files must be 25 MB or smaller."); return; }
    if (!(file.type.startsWith("image/") || file.type.startsWith("audio/") || file.type.startsWith("video/"))) { setError("Choose an image, audio, or video file."); return; }
    if (preview && preview !== "live") URL.revokeObjectURL(preview);
    setMedia(file); setError("");
    setPreview(URL.createObjectURL(file));
  }
  async function startCapture(video = false) {
    setError("");
    try {
      const tracks = await navigator.mediaDevices.getUserMedia(video ? { audio: true, video: true } : { audio: true }); stream.current = tracks;
      if (video) { setMedia({ name: "Live camera preview", type: "video/webm", size: 0, previewStream: tracks }); setPreview("live"); setCaptureKind("video"); return; }
      setCaptureKind("audio");
      const types = video ? ["video/webm;codecs=vp9,opus", "video/webm"] : ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
      const mimeType = types.find((type) => MediaRecorder.isTypeSupported?.(type));
      recorder.current = new MediaRecorder(tracks, mimeType ? { mimeType } : undefined); chunks.current = [];
      recorder.current.ondataavailable = (event) => { if (event.data.size) chunks.current.push(event.data); };
      recorder.current.onstop = () => { if (cancelled.current) { cancelled.current = false; return; } const blob = new Blob(chunks.current, { type: recorder.current.mimeType || "audio/webm" }); const file = new File([blob], "recording.webm", { type: blob.type }); setMedia(file); setPreview(URL.createObjectURL(blob)); stopTracks(); };
      recorder.current.start(); setRecording(true); setSeconds(0); timer.current = setInterval(() => setSeconds((n) => { if (n >= 299) { clearInterval(timer.current); recorder.current?.stop(); setRecording(false); setError("Recording reached the five minute limit."); return 300; } return n + 1; }), 1000);
    } catch (err) { stopTracks(); setError(err.name === "NotAllowedError" ? "Microphone or camera permission was denied. Allow access in your browser settings and try again." : "Camera or microphone is unavailable in this browser or no device was found."); }
  }
  function recordVideo() {
    try {
      const type = ["video/webm;codecs=vp9,opus", "video/webm"].find((v) => MediaRecorder.isTypeSupported?.(v));
      recorder.current = new MediaRecorder(stream.current, type ? { mimeType: type } : undefined); chunks.current = [];
      recorder.current.ondataavailable = (event) => { if (event.data.size) chunks.current.push(event.data); };
      recorder.current.onstop = () => { if (cancelled.current) { cancelled.current = false; return; } const blob = new Blob(chunks.current, { type: recorder.current.mimeType || "video/webm" }); setMedia(new File([blob], "camera-recording.webm", { type: blob.type })); setPreview(URL.createObjectURL(blob)); stopTracks(); };
      recorder.current.start(); setRecording(true); setSeconds(0); timer.current = setInterval(() => setSeconds((n) => { if (n >= 299) { clearInterval(timer.current); recorder.current?.stop(); setRecording(false); setError("Recording reached the five minute limit."); return 300; } return n + 1; }), 1000);
    } catch { setError("Video recording is not supported by this browser."); }
  }
  function stopRecording(cancel = false) { clearInterval(timer.current); setRecording(false); if (cancel) { cancelled.current = true; recorder.current?.stop(); stopTracks(); chunks.current = []; setMedia(null); if (preview && preview !== "live") URL.revokeObjectURL(preview); setPreview(""); } else recorder.current?.stop(); }
  return <div className="overlay" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><section className="dialog assistant-dialog" role="dialog" aria-modal="true" aria-labelledby="assistant-title">
    <button className="close" aria-label="Close assistant" onClick={onClose}>×</button><div className="section-kicker">HOPECONNECT ASSISTANT</div><h2 id="assistant-title">Let’s connect you with support</h2>
    <p className="dialog-intro">Avoid sharing passwords, identity documents, payment details, exact addresses, or private contact information. You review everything before publishing.</p>
    <div className="assistant-intents" role="group" aria-label="Choose a workflow"><button className={kind === "need" ? "selected" : ""} onClick={() => setKind("need")}>I Need Help</button><button className={kind === "offer" ? "selected" : ""} onClick={() => setKind("offer")}>I Can Help</button></div>
    <div className="assistant-chat" aria-live="polite">{messages.map((m, i) => <p key={i} className={`chat-${m.role}`}><b>{m.role === "assistant" ? "Assistant" : "You"}</b>{m.text}</p>)}</div>
    {!draft && <form onSubmit={prepare}><label htmlFor="assistant-text">Describe what you need or can offer</label><textarea id="assistant-text" rows="3" maxLength="1000" value={text} onChange={(e) => setText(e.target.value)} placeholder="For example: I can offer ten winter jackets in Nashik."/><div className="assistant-media">
      <label className="media-pick">Add image, audio, or video<input type="file" accept="image/*,audio/*,video/*" onChange={(e) => selectMedia(e.target.files?.[0])}/></label><button type="button" onClick={() => startCapture(false)} disabled={recording}>Record Audio</button><button type="button" onClick={() => startCapture(true)} disabled={recording}>Live Camera</button>
      {preview === "live" && !recording && <button type="button" onClick={recordVideo}>Record Video</button>}
      {recording && <><span role="status">Recording {captureKind} · {seconds}s</span><button type="button" onClick={() => stopRecording()}>Stop</button><button type="button" onClick={() => stopRecording(true)}>Cancel</button></>}
    </div>{media && <div className="media-preview"><span>{media.name || "Recording"} · {media.size ? `${(media.size / 1048576).toFixed(1)} MB` : "live preview"}</span><button type="button" onClick={() => { stopTracks(); setMedia(null); setPreview(""); }}>Remove</button>{preview === "live" ? <video autoPlay muted playsInline ref={(el) => { if (el && media.previewStream) el.srcObject = media.previewStream; }} /> : media.type?.startsWith("video/") ? <video controls src={preview}/> : media.type?.startsWith("audio/") ? <audio controls src={preview}/> : media.type?.startsWith("image/") ? <img src={preview} alt="Selected media preview"/> : null}</div>}
      {media && !media.previewStream && <><p className="privacy">Media stays on your device until upload. Audio is sent to the configured transcription provider; temporary server files are deleted after processing. Image analysis and video analysis are not configured.</p><div className="assistant-media-process"><button type="button" className="secondary" onClick={processMedia} disabled={busy}>{busy ? `Uploading · ${progress}%` : "Upload and process media"}</button>{busy && <><progress max="100" value={progress} aria-label="Upload progress"/><button type="button" onClick={() => request.current?.abort()}>Cancel upload</button></>}</div></>}
      <button className="primary submit" disabled={busy}>{busy ? "Preparing…" : "Prepare a draft"}</button></form>}
    {draft && <form onSubmit={publish} className="assistant-draft"><p><b>Review your draft · not published</b></p>{draft.uncertainty?.length > 0 && <p className="privacy">AI review notes: {draft.uncertainty.join(" ")}</p>}<label>Title<input required maxLength="90" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })}/></label><label>Description<textarea required maxLength="500" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })}/></label><div className="form-two"><label>Category<select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>{categories.map((c) => <option key={c}>{c}</option>)}</select></label><label>Area or city<input required maxLength="80" value={draft.location} placeholder="Add a broad area" onChange={(e) => setDraft({ ...draft, location: e.target.value })}/></label></div><div className="form-two"><label>Urgency<select value={draft.urgency} onChange={(e) => setDraft({ ...draft, urgency: e.target.value })}>{["Normal", "High", "Critical"].map((v) => <option key={v}>{v}</option>)}</select></label><label>Quantity<input required type="number" min="1" max="100000" value={draft.quantity} placeholder="Add a quantity" onChange={(e) => setDraft({ ...draft, quantity: e.target.value })}/></label></div><div className="assistant-actions"><button type="button" className="secondary" onClick={() => setDraft(null)}>Edit description</button><button className="primary" disabled={busy}>{busy ? "Publishing…" : `Confirm and publish ${kind === "need" ? "request" : "offer"}`}</button></div></form>}
    {error && <p className="assistant-error" role="alert">{error}</p>}
  </section></div>;
}
