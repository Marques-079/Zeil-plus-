"use client";

import Image from "next/image";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";

import { useState, useRef } from "react";

export default function Home() {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | uploading | success | error
  const [msg, setMsg] = useState("");
  const inputRef = useRef(null);

  async function handleSubmit() {
    if (!file) return;

    const name = file.name?.toLowerCase() || "";
    const okExt = name.endsWith(".pdf") || name.endsWith(".doc") || name.endsWith(".docx");
    if (!okExt) {
      setStatus("error");
      setMsg("Please upload a PDF/DOC/DOCX.");
      return;
    }

    try {
      setStatus("uploading");
      setMsg("");

      const fd = new FormData();
      fd.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: fd,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Upload failed.");

      setStatus("success");
      setMsg(`Saved as ${data.filename}`);

      setFile(null);
      if (inputRef.current) inputRef.current.value = ""; // clear file input
    } catch (e) {
      setStatus("error");
      setMsg(e.message || "Upload failed.");
    }
  }

  return (
    <div className="font-sans grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20 bg-gradient-to-b from-[#2E005E] via-[#3A007A] to-[#5E17EB] text-white">
      <main className="flex flex-col gap-[32px] row-start-2 items-center text-center sm:items-center max-w-2xl">
        {/* Logo or Hero Icon */}
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
          Upload your CV and let AI help you stand out. Get instant feedback,
          tailored insights, and boost your hiring chances — powered by ZEIL.
        </p>

        {/* Upload Section */}
        <div className="w-full mt-6 flex flex-col sm:flex-row items-center justify-center gap-4 bg-white/10 backdrop-blur-md p-6 rounded-2xl border border-white/20 shadow-lg">
          <Input
            ref={inputRef}
            type="file"
            className="bg-white text-black rounded-md border-0 w-full sm:w-auto"
            accept=".pdf,.doc,.docx"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <Button
            onClick={handleSubmit}
            disabled={!file || status === "uploading"}
            className="bg-[#8B5CF6] hover:bg-[#7C3AED] text-white font-semibold px-6 py-2 rounded-md transition-all"
          >
            {status === "uploading" ? "Uploading…" : "Submit CV"}
          </Button>
        </div>

        {/* Status message */}
        {status !== "idle" && (
          <p
            className={
              status === "success"
                ? "text-green-300"
                : status === "error"
                ? "text-red-300"
                : "text-white/80"
            }
          >
            {msg}
          </p>
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
