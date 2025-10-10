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
  const [status, setStatus] = useState("idle"); // idle | recording | processing
  const [result, setResult] = useState(null);
  const [attemptUsed, setAttemptUsed] = useState(false);
  const [finished, setFinished] = useState(false);
  const startTsRef = useRef(0);
  const endTsRef = useRef(0);

  // --- helpers to present a neat score ---
  function extractFinalScore(payload) {
    if (!payload) return null;
    // { scores: { final: 82, ... } }
    if (payload.scores && (typeof payload.scores.final === "number" || typeof payload.scores.final === "string")) {
      const v = Number(payload.scores.final);
      return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : null;
    }
    // { final: 82 } or { score: 82 }
    for (const key of ["final", "score"]) {
      if (payload[key] !== undefined) {
        const v = Number(payload[key]);
        return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : null;
      }
    }
    return null;
  }

  function scoreMessage(score) {
    if (score === null) return "We couldn't read a score. If this persists, contact support.";
    if (score >= 90) return "Exceptional speaking clarity and accuracy — outstanding!";
    if (score >= 75) return "Great job — strong pronunciation and fluency.";
    if (score >= 60) return "Good work — understandable with minor areas to polish.";
    if (score >= 40) return "Fair — keep practicing pronunciation and pacing.";
    return "Needs improvement — try speaking more clearly and steadily.";
  }

  // Fetch test data
  useEffect(() => {
    fetch(`${API}/test`)
      .then((r) => r.json())
      .then(setTest)
      .catch((err) => {
        console.error("Error fetching test:", err);
        setResult({ error: "Failed to load the test. Please refresh." });
      });
  }, []);

  async function start() {
    if (attemptUsed) return; // one attempt only
    setResult(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferred = "audio/webm;codecs=opus";
      const options = MediaRecorder.isTypeSupported(preferred) ? { mimeType: preferred } : undefined;

      const mr = new MediaRecorder(stream, options);
      chunksRef.current = [];

      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      mr.onstart = () => {
        startTsRef.current = performance.now();
        setStatus("recording");
        // Reserve the single attempt as soon as recording begins
        setAttemptUsed(true);
      };

      mr.onstop = async () => {
        endTsRef.current = performance.now();
        setStatus("processing");

        if (!test || !test.prompt_id) {
          setResult({ error: "Missing prompt_id from test." });
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
          setResult({ error: "We couldn't score your audio. Please contact support." });
        }

        setStatus("idle");
      };

      mr.start();
      setRec(mr);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      setResult({ error: "Microphone access was denied or not available." });
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

  const finalScore = extractFinalScore(result);
  const friendlyMessage = scoreMessage(finalScore);

  // --- Thank You Screen ---
  if (finished) {
    return (
      <motion.div
        className="min-h-screen p-8 flex flex-col items-center justify-center font-sans bg-gradient-to-b from-[#2E005E] via-[#3A007A] to-[#5E17EB] text-white"
        initial="hidden"
        animate="visible"
        variants={fadeUp}
      >
        <motion.div variants={fadeUp} className="mb-6">
          <Image
            src="/zeil-logo.png"
            alt="Zeil Logo"
            width={160}
            height={56}
            className="opacity-90"
          />
        </motion.div>
        <motion.h1 variants={fadeUp} className="text-4xl sm:text-5xl font-extrabold mb-3 text-center">
          Thank you!
        </motion.h1>
        <motion.p variants={fadeUp} className="text-white/90 text-center max-w-xl">
          Your audio language test has been submitted. We appreciate your time.
        </motion.p>
      </motion.div>
    );
  }

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

      <motion.h1 variants={fadeUp} className="text-4xl sm:text-5xl font-extrabold mb-2 text-center">
        Audio Language Test
      </motion.h1>

      <motion.p variants={fadeUp} className="mb-6 text-white/90 text-center max-w-2xl">
        Read the prompt clearly and naturally. <strong>You only get one attempt.</strong>
      </motion.p>

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
              <h3 className="mb-2 font-semibold">Read out loud:</h3>
              <div className="space-y-1">
                {Array.isArray(test.sentences) && test.sentences.length > 0 ? (
                  test.sentences.map((line, idx) => (
                    <p key={idx} className="text-white/90">{line}</p>
                  ))
                ) : (
                  <p className="text-white/70">No sentences provided.</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-4">
              {status !== "recording" ? (
                <Button
                  onClick={start}
                  disabled={attemptUsed}
                  className={`${
                    attemptUsed ? "bg-white/30 text-white/60 cursor-not-allowed" : "bg-purple-600 hover:bg-purple-700"
                  }`}
                >
                  {attemptUsed ? "Attempt used" : "Start"}
                </Button>
              ) : (
                <Button onClick={stop} className="bg-red-600 hover:bg-red-700">
                  Stop
                </Button>
              )}
              <span className="text-white/80">
                Status: <strong>{status}</strong>
              </span>
            </div>

            {/* Neat result display (no JSON) */}
            {result && (
              <motion.div
                variants={fadeUp}
                className="mt-2 p-5 border border-white/20 rounded-xl bg-white/10"
              >
                {result.error ? (
                  <div>
                    <h3 className="mb-2 text-xl font-semibold">Result</h3>
                    <p className="text-red-300">{result.error}</p>
                    <p className="text-white/70 mt-2 text-sm">
                      If you think this is a mistake, contact support. (One attempt per user.)
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <h3 className="text-xl font-semibold">Your Score</h3>
                    <div className="flex items-end gap-4">
                      <div className="text-5xl font-extrabold leading-none">
                        {finalScore !== null ? Math.round(finalScore) : "—"}
                      </div>
                      <div className="pb-1 text-white/80">/ 100</div>
                    </div>
                    <Progress value={finalScore ?? 0} className="h-3" />
                    <p className="text-white/90">{friendlyMessage}</p>

                    {/* Optional: brief subscores if present */}
                    {result.scores && typeof result.scores === "object" && (
                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {Object.entries(result.scores)
                          .filter(([k]) => k !== "final")
                          .slice(0, 6)
                          .map(([k, v]) => (
                            <div
                              key={k}
                              className="flex items-center justify-between rounded-md border border-white/10 bg-white/5 px-3 py-2"
                            >
                              <span className="capitalize text-white/85">{k.replace(/_/g, " ")}</span>
                              <span className="font-semibold">{typeof v === "number" ? Math.round(v) : String(v)}</span>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Finish Button (appears once result is shown) */}
                <div className="mt-5 flex justify-end">
                  <Button
                    onClick={() => setFinished(true)}
                    className="bg-[#10B981] hover:bg-[#059669] text-white font-semibold px-6 py-2 rounded-md transition-all"
                  >
                    Finish
                  </Button>
                </div>
              </motion.div>
            )}
          </motion.div>
        </AnimatePresence>
      )}
    </motion.div>
  );
}
