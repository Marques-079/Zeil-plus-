"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";

export default function Dashboard() {
  // Placeholder data
  const totalCVs = 124;
  const averageScore = 78;
  const topScores = [
    { name: "Marcus Chan", score: 95 },
    { name: "Joshua Li", score: 92 },
    { name: "Sofia Patel", score: 90 },
    { name: "Ethan Roberts", score: 89 },
    { name: "Maya Thompson", score: 88 },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#2E005E] via-[#3A007A] to-[#5E17EB] text-white p-10 font-sans">
      <div className="max-w-5xl mx-auto flex flex-col gap-10">
        {/* Header */}
        <header className="text-center mb-4">
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">
            EasyHire Dashboard
          </h1>
          <p className="text-white/80 mt-2">
            Real-time insights into CV performance and engagement
          </p>
        </header>

        {/* Stats Cards */}
        <div className="grid sm:grid-cols-3 gap-6">
          <Card className="bg-white/10 border-white/10 backdrop-blur-md text-white shadow-xl hover:shadow-2xl transition-all">
            <CardHeader>
              <CardTitle>Total CVs Uploaded</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-5xl font-bold">{totalCVs}</p>
            </CardContent>
          </Card>

          <Card className="bg-white/10 border-white/10 backdrop-blur-md text-white shadow-xl hover:shadow-2xl transition-all">
            <CardHeader>
              <CardTitle>Average Score</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3">
                <p className="text-5xl font-bold">{averageScore}%</p>
                <Progress
                  value={averageScore}
                  className="h-2 bg-white/20"
                />
              </div>
            </CardContent>
          </Card>

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
        </div>

        {/* Top 5 Leaderboard */}
        <Card className="bg-white/10 border-white/10 backdrop-blur-md text-white shadow-xl hover:shadow-2xl transition-all">
          <CardHeader>
            <CardTitle>Top 5 CV Scores</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
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
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
