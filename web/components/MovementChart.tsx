"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { movementSeries } from "@/lib/theme";

type Row = {
  year: number;
  joined: number;
  inducted: number;
  senior: number;
  departed: number;
};

/**
 * PRD 6.2: the "we can finally see the chapter's flow" moment. Give it the
 * most screen space.
 *
 * Colours are the four validated hexes from PRD 13.2, and every series
 * carries a visible legend entry -- the gold and blue steps sit below 3:1
 * against white, which is fine inside a filled bar but means colour alone
 * must never be the only cue.
 */
export function MovementChart({ data }: { data: Row[] }) {
  const recent = data.filter((d) => d.year >= 2005);

  return (
    <div className="h-[290px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={recent} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#E4EAF0" />
          <XAxis
            dataKey="year"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "#8A8AA3" }}
            interval="preserveStartEnd"
            minTickGap={18}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "#8A8AA3" }}
            allowDecimals={false}
            width={38}
          />
          <Tooltip
            cursor={{ fill: "rgba(19,15,45,0.04)" }}
            contentStyle={{
              borderRadius: 12,
              border: "1px solid #E4EAF0",
              boxShadow: "0 4px 16px rgba(19,15,45,0.08)",
              fontSize: 12,
              padding: "8px 10px",
            }}
            labelStyle={{ fontWeight: 700, marginBottom: 4, color: "#130F2D" }}
          />
          <Legend
            verticalAlign="top"
            align="left"
            height={30}
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 11.5, paddingBottom: 6 }}
          />
          {movementSeries.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stackId="movement"
              fill={s.color}
              radius={s.key === "departed" ? [3, 3, 0, 0] : undefined}
              maxBarSize={22}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
