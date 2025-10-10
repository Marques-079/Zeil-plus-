'use client';

import { useState, useRef } from "react";
import Image from "next/image";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";

export default function Home() {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);

  // Applicant details
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // Short answers
  const [whyJoin, setWhyJoin] = useState("");
  const [messageToHM, setMessageToHM] = useState("");

  // Checkboxes
  const [isNZCitizen, setIsNZCitizen] = useState(false);
  const [hasCriminalHistory, setHasCriminalHistory] = useState(false);

  // NEW: packaged submission (for dashboard ingestion later)
  const [packagedSubmission, setPackagedSubmission] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!file) {
      console.error("No file selected");
      setResult({ error: "Please upload your CV first." });
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("keywords", "POS,sales,EFTPOS,brand");

    // Extra fields (still sent to your FastAPI if you want to handle them server-side)
    formData.append("name", name);
    formData.append("email", email);
    formData.append("phone", phone);
    formData.append("why_join", whyJoin);
    formData.append("message_to_hiring_manager", messageToHM);
    formData.append("is_nz_citizen", String(isNZCitizen));
    formData.append("has_criminal_history", String(hasCriminalHistory));

    try {
      // 1) Submit to scorer
      const res = await fetch("http://localhost:8000/score", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (data.success) {
        // keep existing behavior
        setResult(data.data);

        // 2) ALSO: Package all form info + score for your dashboard
        const submissionPayload = {
          id:
            (typeof crypto !== "undefined" &&
              crypto.randomUUID &&
              crypto.randomUUID()) ||
            `sub_${Date.now()}`,
          submittedAt: new Date().toISOString(),
          // File metadata only (file bytes were already sent in formData above)
          fileName: file?.name || null,
          fileType: file?.type || null,
          // Applicant fields
          name,
          email,
          phone,
          whyJoin,
          messageToHM,
          isNZCitizen,
          hasCriminalHistory,
          // Scoring result returned from backend
          scoring: data.data || null,
        };

        // Save locally so your dashboard page (or any page) can read it if needed
        try {
          const existing =
            JSON.parse(localStorage.getItem("easyhire_submissions") || "[]") ||
            [];
          existing.push(submissionPayload);
          localStorage.setItem(
            "easyhire_submissions",
            JSON.stringify(existing)
          );
          // also store the latest one
          localStorage.setItem(
            "easyhire_latest_submission",
            JSON.stringify(submissionPayload)
          );
        } catch (err) {
          console.warn("localStorage not available or failed:", err);
        }

        // Optionally POST to your Next.js API route to persist for dashboard
        // (Create /pages/api/submissions.ts or /app/api/submissions/route.ts to handle this)
        try {
          await fetch("/api/submissions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(submissionPayload),
          });
        } catch (err) {
          // Non-blocking; still keep the packaged data locally even if API route isn't ready
          console.warn("Failed to send submission to /api/submissions:", err);
        }

        // Keep in state so you can immediately render/inspect what will go to the dashboard
        setPackagedSubmission(submissionPayload);
      } else {
        console.error("Error:", data.error);
        setResult({ error: data.error });
      }
    } catch (err) {
      console.error("Request failed:", err);
      setResult({ error: (err && err.message) ? err.message : String(err) });
    }
  }

  return (
    <div className="font-sans grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20 bg-gradient-to-b from-[#2E005E] via-[#3A007A] to-[#5E17EB] text-white">
      <main className="flex flex-col gap-[32px] row-start-2 items-center text-center sm:items-center max-w-2xl">
        {/* Logo */}
        <Image
          src="/zeil-logo.png"
          alt="Zeil logo"
          width={120}
          height={40}
          className="mb-4 opacity-90"
        />

        {/* Hero Title */}
        <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight">
          EasyHire
        </h1>

        {/* Subtitle */}
        <p className="text-lg sm:text-xl text-white/90 leading-relaxed">
          Upload your CV and let AI help you stand out. Every application gets the spotlight it deserves. Powered by ZEIL.
        </p>

        {/* Upload + Application Section */}
        <form
          onSubmit={handleSubmit}
          className="w-full mt-6 flex flex-col items-stretch justify-center gap-4 bg-white/10 backdrop-blur-md p-6 rounded-2xl border border-white/20 shadow-lg text-left"
        >
          {/* Centered file selector */}
          <div className="w-full flex justify-center">
            <Input
              type="file"
              className="bg-white text-black rounded-md border-0 w-full sm:max-w-sm mx-auto"
              accept=".pdf,.doc,.docx"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </div>

          {/* Divider */}
          <div className="h-px w-full bg-white/20 my-4" />

          {/* Individual boxes for Name, Email, Phone */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-white/90 text-sm">Name</label>
              <Input
                type="text"
                placeholder="Jane Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="bg-white text-black rounded-md border-0 w-full"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-white/90 text-sm">Email</label>
              <Input
                type="email"
                placeholder="jane@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-white text-black rounded-md border-0 w-full"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-white/90 text-sm">Phone number</label>
              <Input
                type="tel"
                placeholder="+64 21 123 4567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="bg-white text-black rounded-md border-0 w-full"
              />
            </div>
          </div>

          {/* Short answer questions */}
          <div className="flex flex-col gap-3 mt-2">
            <div className="flex flex-col gap-2">
              <label className="text-white/90 text-sm">
                Why do you want to join this company?
              </label>
              <textarea
                placeholder="Share your motivation and what excites you about this role…"
                value={whyJoin}
                onChange={(e) => setWhyJoin(e.target.value)}
                className="min-h-[100px] w-full bg-white text-black rounded-md border-0 p-3 outline-none"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-white/90 text-sm">
                Message to the hiring manager...
              </label>
              <textarea
                placeholder="Add a short note or context for your application…"
                value={messageToHM}
                onChange={(e) => setMessageToHM(e.target.value)}
                className="min-h-[100px] w-full bg-white text-black rounded-md border-0 p-3 outline-none"
              />
            </div>
          </div>

          {/* Checkboxes */}
          <div className="h-px w-full bg-white/20 my-2" />
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <label className="inline-flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isNZCitizen}
                onChange={(e) => setIsNZCitizen(e.target.checked)}
                className="h-4 w-4 rounded border-white/30 bg-white/90 text-[#5E17EB]"
              />
              <span className="text-white/90">I am a NZ citizen</span>
            </label>

            <label className="inline-flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={hasCriminalHistory}
                onChange={(e) => setHasCriminalHistory(e.target.checked)}
                className="h-4 w-4 rounded border-white/30 bg-white/90 text-[#5E17EB]"
              />
              <span className="text-white/90">Do you have a criminal history</span>
            </label>
          </div>

          {/* Submit button at bottom */}
          <div className="mt-4 flex justify-center">
            <Button
              type="submit"
              className="bg-[#8B5CF6] hover:bg-[#7C3AED] text-white font-semibold px-6 py-2 rounded-md transition-all"
            >
              Submit
            </Button>
          </div>
        </form>

        {/* Result Display */}
        {result && (
          <div className="mt-6 p-4 bg-white/10 backdrop-blur-md rounded-xl border border-white/20 w-full text-left">
            <h2 className="text-xl font-bold mb-2">Result</h2>
            <pre className="text-sm text-white/90 whitespace-pre-wrap">
              {JSON.stringify(result, null, 2)}
            </pre>
            {result.error && (
              <p className="text-red-400 mt-2">Error: {result.error}</p>
            )}
          </div>
        )}

        {/* Packaged submission preview (what your dashboard can ingest) */}
        {packagedSubmission && (
          <div className="mt-4 p-4 bg-white/10 backdrop-blur-md rounded-xl border border-white/20 w-full text-left">
            <h2 className="text-lg font-semibold mb-2">Packaged Submission</h2>
            <pre className="text-xs text-white/90 whitespace-pre-wrap">
              {JSON.stringify(packagedSubmission, null, 2)}
            </pre>
            <p className="text-white/70 mt-2 text-xs">
              Saved to <code>localStorage.easyhire_submissions</code> and posted to <code>/api/submissions</code> if available.
            </p>
          </div>
        )}

        {/* Call to Action */}
        <div className="mt-8">
          <p className="text-sm sm:text-base text-white/80 mb-3">
            Ready to see how your CV performs?
          </p>
          <Button className="bg-white text-[#5E17EB] font-bold px-6 py-3 rounded-full hover:bg-[#EDE9FE] transition-all">
            Get Started
          </Button>
        </div>
      </main>

      {/* Footer */}
      <footer className="row-start-3 flex gap-[24px] flex-wrap items-center justify-center text-sm text-white/70">
        <a
          className="hover:underline hover:underline-offset-4"
          href="https://zeil.ai"
          target="_blank"
          rel="noopener noreferrer"
        >
          Powered by ZEIL
        </a>
        <a
          className="hover:underline hover:underline-offset-4"
          href="https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RDdQw4w9WgXcQ&start_radio=1"
          target="_blank"
          rel="noopener noreferrer"
        >
          Guaranteed Job Here
        </a>
      </footer>
    </div>
  );
}
