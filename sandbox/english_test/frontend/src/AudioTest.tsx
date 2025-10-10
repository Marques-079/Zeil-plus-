import { API } from "./lib/api";
import { useEffect, useRef, useState } from "react";

type TestPayload = { prompt_id: string; sentences: string[] };

export default function AudioTest() {
  const [test, setTest] = useState<TestPayload | null>(null);
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const [status, setStatus] = useState("idle");
  const [result, setResult] = useState<any>(null);
  const startTsRef = useRef<number>(0);
  const endTsRef = useRef<number>(0);

  useEffect(() => {
    fetch(`${API}/test`).then(r => r.json()).then(setTest).catch(console.error);
  }, []);

  async function start() {
    setResult(null);
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const preferred = "audio/webm;codecs=opus";
    const options = MediaRecorder.isTypeSupported(preferred) ? { mimeType: preferred } : undefined;

    const mr = new MediaRecorder(stream, options as any);
    chunksRef.current = [];

    mr.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
    mr.onstart = () => { startTsRef.current = performance.now(); setStatus("recording"); };
    mr.onstop = async () => {
      endTsRef.current = performance.now();
      setStatus("processing");
      const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
      const fd = new FormData();
      fd.append("prompt_id", test!.prompt_id);
      fd.append("started_ms", String(startTsRef.current));
      fd.append("ended_ms", String(endTsRef.current));
      fd.append("audio", new File([blob], "audio.webm", { type: blob.type }));

      const resp = await fetch(`${API}/score`, { method: "POST", body: fd });
      const data = await resp.json();
      setResult(data);
      setStatus("idle");
    };

    mr.start();  // single chunk; pass a timeslice (ms) if you want live chunks
    setRec(mr);
  }

  function stop() { rec?.stop(); setRec(null); }

  return (
    <div style={{ maxWidth: 680, margin: "2rem auto", fontFamily: "system-ui" }}>
      <h1>Audio Language Test</h1>
      {!test ? <p>Loading…</p> : (
        <>
          <h3>Read out loud:</h3>
          <div style={{ padding: 12, border: "1px solid #ccc", borderRadius: 8 }}>
            <p>{test.sentences[0]}</p>
            <p>{test.sentences[1]}</p>
          </div>

          <div style={{ marginTop: 16 }}>
            {status !== "recording"
              ? <button onClick={start}>Start</button>
              : <button onClick={stop}>Stop</button>}
            <span style={{ marginLeft: 12 }}>Status: <strong>{status}</strong></span>
          </div>

          {result && (
            <div style={{ marginTop: 24 }}>
              <h3>Result</h3>
              <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(result, null, 2)}</pre>
              <p><strong>Final score:</strong> {result.scores.final}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
