'use client';

import { useEffect, useRef, useState } from "react";
import { API } from "../../lib/api";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";

export default function AudioTest() {
  const [test, setTest] = useState(null);
  const [rec, setRec] = useState(null);
  const chunksRef = useRef([]);
  const [status, setStatus] = useState("idle");
  const [result, setResult] = useState(null);
  const startTsRef = useRef(0);
  const endTsRef = useRef(0);

  // Fetch test data
  useEffect(() => {
    fetch(`${API}/test`)
      .then(r => r.json())
      .then(setTest)
      .catch(err => {
        console.error("Error fetching test:", err);
        setResult({ error: err.message });
      });
  }, []);

  async function start() {
    setResult(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferred = "audio/webm;codecs=opus";
      const options = MediaRecorder.isTypeSupported(preferred) ? { mimeType: preferred } : undefined;

      const mr = new MediaRecorder(stream, options);
      chunksRef.current = [];

      mr.ondataavailable = e => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      mr.onstart = () => {
        startTsRef.current = performance.now();
        setStatus("recording");
      };

      mr.onstop = async () => {
        endTsRef.current = performance.now();
        setStatus("processing");

        if (!test || !test.prompt_id) {
          setResult({ error: "Missing prompt_id" });
          setStatus("idle");
          return;
        }

        const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        const fd = new FormData();
        fd.append("prompt_id", test.prompt_id);
        fd.append("started_ms", String(startTsRef.current));
        fd.append("ended_ms", String(endTsRef.current));
        fd.append("audio", new File([blob], "audio.webm", { type: blob.type }));

        try {
          const resp = await fetch(`${API}/score`, { method: "POST", body: fd });
          if (!resp.ok) {
            const text = await resp.text();
            throw new Error(`Server error: ${resp.status} ${text}`);
          }
          const data = await resp.json();
          setResult(data);
        } catch (err) {
          console.error("Error sending audio:", err);
          setResult({ error: err.message });
        }

        setStatus("idle");
      };

      mr.start();
      setRec(mr);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      setResult({ error: err.message });
    }
  }

  function stop() {
    rec?.stop();
    setRec(null);
  }

  // Framer Motion variants
  const fadeUp = {
    hidden: { opacity: 0, y: 30 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
  };

  return (
    <motion.div
      className="min-h-screen p-8 flex flex-col items-center font-sans bg-gradient-to-b from-[#2E005E] via-[#3A007A] to-[#5E17EB] text-white"
      initial="hidden"
      animate="visible"
      variants={fadeUp}
    >
      {/* Logo */}
      <motion.div variants={fadeUp} className="mb-6">
        <Image
          src="/zeil-logo.png"
          alt="Zeil Logo"
          width={140}
          height={50}
          className="opacity-90"
        />
      </motion.div>

      <motion.h1 variants={fadeUp} className="text-4xl sm:text-5xl font-extrabold mb-4 text-center">
        Audio Language Test
      </motion.h1>

      {!test ? (
        <motion.p variants={fadeUp}>Loading…</motion.p>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={test.prompt_id}
            variants={fadeUp}
            className="w-full max-w-2xl flex flex-col gap-6"
          >
            <div className="p-4 border border-white/20 rounded-lg bg-white/10">
              <h3 className="mb-2">Read out loud:</h3>
              {test.sentences.map((line, idx) => (
                <p key={idx}>{line}</p>
              ))}
            </div>

            <div className="flex items-center gap-4">
              {status !== "recording" ? (
                <Button onClick={start} className="bg-purple-600 hover:bg-purple-700">
                  Start
                </Button>
              ) : (
                <Button onClick={stop} className="bg-red-600 hover:bg-red-700">
                  Stop
                </Button>
              )}
              <span>Status: <strong>{status}</strong></span>
            </div>

            {result && (
              <motion.div variants={fadeUp} className="mt-6 p-4 border border-white/20 rounded-lg bg-white/10">
                <h3 className="mb-2">Result</h3>
                <pre className="whitespace-pre-wrap">{JSON.stringify(result, null, 2)}</pre>
                {result.scores ? (
                  <p>
                    <strong>Final score:</strong> {result.scores.final}
                  </p>
                ) : result.error ? (
                  <p className="text-red-400">Error: {result.error}</p>
                ) : (
                  <p className="text-red-400">Error: No scores returned</p>
                )}
              </motion.div>
            )}
          </motion.div>
        </AnimatePresence>
      )}
    </motion.div>
  );
}
