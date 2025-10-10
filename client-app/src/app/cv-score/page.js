"use client";

import { Fragment, useMemo, useState } from "react";
import useSWR from "swr";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowUpDown, ChevronRight, ChevronDown } from "lucide-react";

const fetcher = (url) => fetch(url).then((r) => r.json());

function ScoringDisplay({ scoring }) {
  if (!scoring) return null;

  // String or primitive: just show it plainly
  if (typeof scoring !== "object") {
    return (
      <div className="text-white/90 text-sm break-words">{String(scoring)}</div>
    );
  }

  const meta = scoring.meta || {};
  const matched = Array.isArray(meta.matched_keywords)
    ? meta.matched_keywords
    : [];

  return (
    <div className="space-y-3 text-sm text-white/90">
      <div className="grid sm:grid-cols-2 gap-2">
        <div>
          <span className="text-white/70">File:</span>{" "}
          <span className="font-medium">{scoring.file ?? "—"}</span>
        </div>
        <div>
          <span className="text-white/70">Score:</span>{" "}
          <span className="font-semibold">{scoring.score ?? "—"}</span>
        </div>
        <div className="sm:col-span-2">
          <span className="text-white/70">Path:</span>{" "}
          <span className="break-all">{scoring.path ?? "—"}</span>
        </div>
        <div>
          <span className="text-white/70">Timestamp:</span>{" "}
          <span>
            {scoring.ts ? new Date(scoring.ts).toLocaleString() : "—"}
          </span>
        </div>
      </div>

      {Object.keys(meta).length > 0 && (
        <div className="space-y-2">
          <div className="text-white/70 text-xs">Meta</div>
          <div className="grid sm:grid-cols-2 gap-2">
            {"final_score" in meta && (
              <div>
                <span className="text-white/70">Final score:</span>{" "}
                <span className="font-medium">{meta.final_score}</span>
              </div>
            )}
            {"keyword_coverage_pct" in meta && (
              <div>
                <span className="text-white/70">Keyword coverage:</span>{" "}
                <span className="font-medium">
                  {meta.keyword_coverage_pct}%
                </span>
              </div>
            )}
            {"semantic_similarity_pct" in meta && (
              <div>
                <span className="text-white/70">Semantic similarity:</span>{" "}
                <span className="font-medium">
                  {meta.semantic_similarity_pct}%
                </span>
              </div>
            )}
            {"evidence_rerank_pct" in meta && (
              <div>
                <span className="text-white/70">Evidence re-rank:</span>{" "}
                <span className="font-medium">{meta.evidence_rerank_pct}</span>
              </div>
            )}
          </div>

          {matched.length > 0 && (
            <div>
              <div className="text-white/70">Matched keywords</div>
              <div className="mt-1 flex flex-wrap gap-2">
                {matched.map((kw, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 rounded-full bg-white/15 text-white/90 text-xs"
                  >
                    {kw}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  // Fetch once on mount; no auto refresh/revalidation afterwards
  const { data, error, isLoading } = useSWR("/api/scores", fetcher, {
    refreshInterval: 0,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
  });

  const totalCVs = data?.totalCVs ?? 0;
  const averageScore = data?.averageScore ?? 0;
  const topScores = data?.top5 ?? [];

  // Normalize + stable key per row so rows don't "auto-close" on any local state change
  const items = useMemo(
    () =>
      (data?.items ?? []).map((i) => {
        const d = new Date(i.date);
        const stableKey =
          i.id ??
          i.fileName ??
          i.email ??
          `${i.name ?? "unknown"}-${isFinite(+d) ? +d : i.date ?? "nodate"}`;
        return { ...i, date: d, _stableKey: stableKey };
      }),
    [data]
  );

  // Search, sorting, pagination
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState(null); // "score" | "date" | null
  const [sortDir, setSortDir] = useState("desc"); // "asc" | "desc"
  // Track ALL expanded rows in a Set; never auto-collapse on other interactions
  const [expanded, setExpanded] = useState(() => new Set());

  const itemsPerPage = 25;

  const filteredCVs = useMemo(() => {
    let result = items.filter((cv) =>
      (cv.name || "").toLowerCase().includes(search.toLowerCase())
    );

    if (sortBy) {
      result.sort((a, b) => {
        if (sortBy === "score") {
          return sortDir === "asc" ? a.score - b.score : b.score - a.score;
        }
        if (sortBy === "date") {
          const da = new Date(a.date).getTime();
          const db = new Date(b.date).getTime();
          return sortDir === "asc" ? da - db : db - da;
        }
        return 0;
      });
    } else {
      result.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    }

    return result;
  }, [items, search, sortBy, sortDir]);

  const totalPages = Math.ceil(filteredCVs.length / itemsPerPage) || 1;
  const currentItems = filteredCVs.slice(
    (page - 1) * itemsPerPage,
    page * itemsPerPage
  );

  const fadeUp = {
    hidden: { opacity: 0, y: 30 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
  };

  function toggleExpand(id) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={fadeUp}
      className="min-h-screen bg-gradient-to-b from-[#2E005E] via-[#3A007A] to-[#5E17EB] text-white p-10 font-sans"
    >
      <div className="max-w-5xl mx-auto flex flex-col gap-10">
        {/* Header */}
        <motion.header variants={fadeUp} className="text-center mb-4">
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">
            EasyHire Dashboard
          </h1>
          <p className="text-white/80 mt-2">
            Real-time insights into CV performance and engagement
          </p>
          {error && <p className="text-rose-300 mt-2">Failed to load scores.</p>}
          {isLoading && <p className="text-white/60 mt-2">Loading…</p>}
        </motion.header>

        {/* Stats Cards */}
        <motion.div
          variants={fadeUp}
          className="grid sm:grid-cols-3 gap-6"
          transition={{ staggerChildren: 0.1 }}
        >
          <motion.div variants={fadeUp}>
            <Card className="bg-white/10 border-white/10 backdrop-blur-md text-white shadow-xl hover:shadow-2xl transition-all">
              <CardHeader>
                <CardTitle>Total CVs Uploaded</CardTitle>
              </CardHeader>
              <CardContent>
                <motion.p
                  initial={{ scale: 0.8 }}
                  animate={{ scale: 1 }}
                  transition={{ duration: 0.4 }}
                  className="text-5xl font-bold"
                >
                  {totalCVs}
                </motion.p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={fadeUp}>
            <Card className="bg-white/10 border-white/10 backdrop-blur-md text-white shadow-xl hover:shadow-2xl transition-all">
              <CardHeader>
                <CardTitle>Average Score</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-3">
                  <motion.p
                    initial={{ scale: 0.8 }}
                    animate={{ scale: 1 }}
                    transition={{ duration: 0.4 }}
                    className="text-5xl font-bold"
                  >
                    {averageScore}%
                  </motion.p>
                  <Progress value={Number(averageScore)} className="h-2 bg-white/20" />
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={fadeUp}>
            <Card className="bg-white/10 border-white/10 backdrop-blur-md text-white shadow-xl hover:shadow-2xl transition-all">
              <CardHeader>
                <CardTitle>System Status</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-green-400 font-semibold text-lg">Operational</p>
                <p className="text-sm text-white/70 mt-1">All systems running smoothly</p>
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>

        {/* Top 5 Leaderboard */}
        <motion.div variants={fadeUp}>
          <Card className="bg-white/10 border-white/10 backdrop-blur-md text-white shadow-xl hover:shadow-2xl transition-all">
            <CardHeader>
              <CardTitle>Top 5 CV Scores</CardTitle>
            </CardHeader>
            <CardContent>
              <AnimatePresence>
                <motion.div
                  key="leaderboard"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4 }}
                  className="flex flex-col gap-4"
                >
                  {(topScores ?? []).map((item, index) => (
                    <div key={index}>
                      <div className="flex justify-between items-center">
                        <p className="font-semibold">
                          {index + 1}. {item.name}
                        </p>
                        <p className="text-lg font-bold text-purple-300">{item.score}%</p>
                      </div>
                      {index < (topScores?.length ?? 0) - 1 && (
                        <Separator className="bg-white/10 mt-2" />
                      )}
                    </div>
                  ))}
                </motion.div>
              </AnimatePresence>
            </CardContent>
          </Card>
        </motion.div>

        {/* CV List */}
        <motion.div variants={fadeUp}>
          <Card className="bg-white/10 border-white/10 backdrop-blur-md text-white shadow-xl hover:shadow-2xl transition-all">
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <CardTitle>All Uploaded CVs</CardTitle>
                <Input
                  placeholder="Search candidates..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  className="w-full sm:w-64 bg-white text-black rounded-md border-0"
                />
              </div>
            </CardHeader>

            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-white/90 text-sm sm:text-base">
                  <thead className="border-b border-white/20 text-white/70">
                    <tr>
                      <th className="py-2 px-3 w-10"></th>
                      <th className="py-2 px-3">Name</th>
                      <th className="py-2 px-3">
                        <div className="flex items-center gap-2">
                          Score
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSortBy("score");
                              setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
                            }}
                            className="text-white/70 hover:text-white p-1"
                          >
                            <ArrowUpDown size={16} />
                          </Button>
                        </div>
                      </th>
                      <th className="py-2 px-3">
                        <div className="flex items-center gap-2">
                          Date Uploaded
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSortBy("date");
                              setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
                            }}
                            className="text-white/70 hover:text-white p-1"
                          >
                            <ArrowUpDown size={16} />
                          </Button>
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <AnimatePresence initial={false}>
                      {currentItems.map((cv) => {
                        const key = cv._stableKey;
                        const isOpen = expanded.has(key);
                        return (
                          <Fragment key={key}>
                            <motion.tr
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="hover:bg-white/10 transition-all border-b border-white/5"
                            >
                              <td className="py-2 px-3">
                                <button
                                  type="button"
                                  onClick={() => toggleExpand(key)}
                                  aria-label={isOpen ? "Collapse" : "Expand"}
                                  className="p-1 rounded hover:bg-white/10"
                                >
                                  {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                                </button>
                              </td>
                              <td className="py-2 px-3 font-semibold">{cv.name}</td>
                              <td className="py-2 px-3 text-purple-300 font-bold">{cv.score}%</td>
                              <td className="py-2 px-3">
                                {isFinite(+new Date(cv.date))
                                  ? new Date(cv.date).toLocaleDateString()
                                  : "—"}
                              </td>
                            </motion.tr>

                            {/* Expanded details row (no autoclose; stable key) */}
                            <tr className={`${isOpen ? "" : "hidden"} border-b border-white/10`}>
                              <td colSpan={4} className="py-3 px-3 bg-white/5">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div>
                                    <div className="text-white/70 text-xs">Email</div>
                                    <div className="font-medium text-white/90 text-sm">
                                      {cv.email || "—"}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-white/70 text-xs">Phone</div>
                                    <div className="font-medium text-white/90 text-sm">
                                      {cv.phone || "—"}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-white/70 text-xs">NZ Citizen</div>
                                    <div className="font-medium text-white/90 text-sm">
                                      {cv.isNZCitizen ? "Yes" : "No"}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-white/70 text-xs">Criminal History</div>
                                    <div className="font-medium text-white/90 text-sm">
                                      {cv.hasCriminalHistory ? "Yes" : "No"}
                                    </div>
                                  </div>
                                  <div className="md:col-span-2">
                                    <div className="text-white/70 text-xs">
                                      Why do you want to join?
                                    </div>
                                    <div className="text-white/90 text-sm whitespace-pre-wrap break-words">
                                      {cv.whyJoin || "—"}
                                    </div>
                                  </div>
                                  <div className="md:col-span-2">
                                    <div className="text-white/70 text-xs">
                                      Message to the hiring manager
                                    </div>
                                    <div className="text-white/90 text-sm whitespace-pre-wrap break-words">
                                      {cv.messageToHM || "—"}
                                    </div>
                                  </div>
                                  <div className="md:col-span-2">
                                    <div className="text-white/70 text-xs">File</div>
                                    <div className="font-medium text-white/90 text-sm">
                                      {cv.fileName || "—"}{" "}
                                      <span className="text-white/60">{cv.fileType || ""}</span>
                                    </div>
                                  </div>
                                  {cv.scoring && (
                                    <div className="md:col-span-2">
                                      <div className="text-white/70 text-xs">Scoring</div>
                                      <ScoringDisplay scoring={cv.scoring} />
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          </Fragment>
                        );
                      })}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex justify-between items-center mt-6">
                <Button
                  variant="outline"
                  disabled={page === 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="bg-white/10 text-white hover:bg-white/20 border-white/20"
                >
                  Previous
                </Button>
                <p className="text-sm text-white/70">
                  Page {page} of {totalPages}
                </p>
                <Button
                  variant="outline"
                  disabled={page === totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="bg-white/10 text-white hover:bg-white/20 border-white/20"
                >
                  Next
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  );
}
