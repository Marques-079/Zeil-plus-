"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowUpDown } from "lucide-react";

export default function Dashboard() {
  const totalCVs = 124;
  const averageScore = 78;
  const topScores = [
    { name: "Alice Nguyen", score: 95 },
    { name: "James Li", score: 92 },
    { name: "Sofia Patel", score: 90 },
    { name: "Ethan Roberts", score: 89 },
    { name: "Maya Thompson", score: 88 },
  ];

  // Placeholder dataset of uploaded CVs
  const allCVs = Array.from({ length: 98 }, (_, i) => ({
    name: `Candidate ${String.fromCharCode(65 + (i % 26))}${i}`,
    score: Math.floor(Math.random() * 41) + 60, // 60–100
    date: new Date(2025, 9, 5 + (i % 25)),
  }));

  // Search, sorting, pagination
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState(null);
  const [sortDir, setSortDir] = useState("desc");

  const itemsPerPage = 25;

  const filteredCVs = useMemo(() => {
    let result = [...allCVs].filter((cv) =>
      cv.name.toLowerCase().includes(search.toLowerCase())
    );

    if (sortBy) {
      result.sort((a, b) => {
        if (sortBy === "score") {
          return sortDir === "asc" ? a.score - b.score : b.score - a.score;
        }
        if (sortBy === "date") {
          return sortDir === "asc"
            ? a.date.getTime() - b.date.getTime()
            : b.date.getTime() - a.date.getTime();
        }
        return 0;
      });
    } else {
      // Default alphabetical sort
      result.sort((a, b) => a.name.localeCompare(b.name));
    }

    return result;
  }, [allCVs, search, sortBy, sortDir]);

  const totalPages = Math.ceil(filteredCVs.length / itemsPerPage);
  const currentItems = filteredCVs.slice(
    (page - 1) * itemsPerPage,
    page * itemsPerPage
  );

  // Animation variants
  const fadeUp = {
    hidden: { opacity: 0, y: 30 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
  };

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
                  <Progress value={averageScore} className="h-2 bg-white/20" />
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
                <p className="text-sm text-white/70 mt-1">
                  All systems running smoothly
                </p>
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
                  {topScores.map((item, index) => (
                    <div key={index}>
                      <div className="flex justify-between items-center">
                        <p className="font-semibold">
                          {index + 1}. {item.name}
                        </p>
                        <p className="text-lg font-bold text-purple-300">
                          {item.score}%
                        </p>
                      </div>
                      {index < topScores.length - 1 && (
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
                      <th className="py-2 px-3">Name</th>
                      <th className="py-2 px-3">
                        <div className="flex items-center gap-2">
                          Score
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSortBy("score");
                              setSortDir((prev) =>
                                prev === "asc" ? "desc" : "asc"
                              );
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
                              setSortDir((prev) =>
                                prev === "asc" ? "desc" : "asc"
                              );
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
                    <AnimatePresence>
                      {currentItems.map((cv, index) => (
                        <motion.tr
                          key={index}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="hover:bg-white/10 transition-all border-b border-white/5"
                        >
                          <td className="py-2 px-3 font-semibold">{cv.name}</td>
                          <td className="py-2 px-3 text-purple-300 font-bold">
                            {cv.score}%
                          </td>
                          <td className="py-2 px-3">
                            {cv.date.toLocaleDateString()}
                          </td>
                        </motion.tr>
                      ))}
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
