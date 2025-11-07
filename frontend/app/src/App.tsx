import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
} from "react-native-web";
import type { LoadedData } from "./core";
import { loadFromCSV, loadFromXLSX, trainModel, predictNext } from "./core";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Legend,
  Tooltip,
} from "chart.js";

import type { ChartData, ChartOptions } from "chart.js";

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Legend, Tooltip);

export default function App() {
  const [status, setStatus] = useState("idle");
  const [data, setData] = useState<LoadedData | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [model, setModel] = useState<any>(null);
  const [forecast, setForecast] = useState<string>("");

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus(`reading ${file.name} ...`);
    const ext = file.name.toLowerCase().split(".").pop();
    try {
      if (ext === "csv") {
        const text = await file.text();
        const loaded = await loadFromCSV(text);
        setData(loaded);
        setTarget(guessTarget(loaded));
        setStatus("data loaded");
      } else if (ext === "xlsx") {
        const buf = await file.arrayBuffer();
        const loaded = await loadFromXLSX(buf);
        setData(loaded);
        setTarget(guessTarget(loaded));
        setStatus("data loaded");
      } else {
        throw new Error("Unsupported file type (use .csv or .xlsx)");
      }
      setModel(null);
      setForecast("");
    } catch (err: any) {
      setStatus(`error: ${err.message || String(err)}`);
    }
  }

  function guessTarget(loaded: LoadedData): string | null {
    return (
      loaded.headers.find((h) => h !== loaded.datetimeKey) ?? null
    );
  }

  async function handleTrain() {
    if (!data || !target) return;
    setStatus("training ...");
    try {
      const booster = await trainModel(data, target);
      setModel(booster);
      setStatus("trained");
    } catch (err: any) {
      setStatus(`error: ${err.message || String(err)}`);
    }
  }

  function handlePredict() {
    if (!data || !target || !model) return;
    const yhat = predictNext(data, target, model);
    setForecast(
      Number.isFinite(yhat)
        ? `Target="${target}" → next(+1) forecast: ${yhat.toFixed(4)}`
        : String(yhat)
    );
    setStatus("predicted");
  }

  const chartData = buildChartData(data);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "#000000ff",
        padding: 24,
        alignItems: "center",
      }}
    >
      <Text
        style={{
          fontSize: 28,
          fontWeight: "600",
          color: "#e5e7eb",
          marginBottom: 16,
        }}
      >
        Client Side Time-Series Forecast
      </Text>

      {/* File input (web via react-native-web) */}
      <View
        style={{
          width: "100%",
          maxWidth: 960,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <input
          type="file"
          accept=".csv,.xlsx"
          onChange={handleFileChange}
          style={{
            padding: 8,
            borderRadius: 8,
            border: "1px solid #5a5a5aff",
            background: "#111827",
            color: "#e5e7eb",
            flex: 1,
          }}
        />
        <Text
          style={{ marginLeft: 12, color: "#9ca3af" }}
        >
          Status: {status}
        </Text>
      </View>

      {/* Controls */}
      <View
        style={{
          width: "100%",
          maxWidth: 960,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "flex-start",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <Text style={{ color: "#9ca3af" }}>Target:</Text>
        <select
          value={target ?? ""}
          onChange={(e) => setTarget(e.target.value || null)}
          style={{
            padding: 8,
            borderRadius: 8,
            border: "1px solid #4b5563",
            background: "#111827",
            color: "#e5e7eb",
            minWidth: 120,
          }}
        >
          <option value="">(select)</option>
          {data?.headers
            .filter((h) => h !== data.datetimeKey)
            .map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
        </select>

        <Pressable
          onPress={handleTrain}
          style={{
            width: 100,
            paddingVertical: 8,
            paddingHorizontal: 16,
            borderRadius: 999,
            backgroundColor: "#22c55e",
          }}
        >
          <Text style={{ color: "#020817", fontWeight: "600" }}>
            Train
          </Text>
        </Pressable>

        <Pressable
          onPress={handlePredict}
          style={{
            width: 100,
            paddingVertical: 8,
            paddingHorizontal: 16,
            borderRadius: 999,
            backgroundColor: model ? "#38bdf8" : "#371f1fff",
            opacity: model ? 1 : 0.4,
          }}
        >
          <Text style={{ color: "#020817", fontWeight: "600" }}>
            Predict +1
          </Text>
        </Pressable>
      </View>

      {/* Chart */}
      <View
        style={{
          width: "100%",
          maxWidth: 960,
          height: 360,
          backgroundColor: "#000000ff",
          borderRadius: 16,
          padding: 12,
        }}
      >
        {chartData ? (
          <Line
            data={chartData.data}
            options={chartData.options}
          />
        ) : (
          <Text
            style={{
              color: "#6b7280",
              textAlign: "center",
              marginTop: 16,
            }}
          >
            Upload a CSV/XLSX file to visualize all series.
          </Text>
        )}
      </View>

      {/* Output */}
      <ScrollView
        style={{
          width: "100%",
          maxWidth: 960,
          marginTop: 12,
          backgroundColor: "#000000ff",
          borderRadius: 12,
          padding: 12,
        }}
      >
        <Text
          style={{
            color: "#e5e7eb",
            fontFamily: "monospace",
          }}
        >
          {forecast || "Prediction result will appear here."}
        </Text>
      </ScrollView>
    </View>
  );
}

function buildChartData(
  data: LoadedData | null
): { data: ChartData<"line">; options: ChartOptions<"line"> } | null {
  if (!data || !data.rows.length) return null;

  const useDatetime =
    !!data.datetimeKey && data.headers.includes(data.datetimeKey);

  const labels: string[] = useDatetime
    ? data.rows.map((r) => String(r[data.datetimeKey as string] ?? ""))
    : data.rows.map((_, i) => String(i)); // ← number ではなく string に統一

  const numericKeys = data.headers.filter((h) => {
    if (h === data.datetimeKey) return false;
    const v = data.rows[0]?.[h];
    const n = Number(v);
    return Number.isFinite(n);
  });

  if (!numericKeys.length) return null;

  const palette = [
    "#22c55e",
    "#60a5fa",
    "#f59e0b",
    "#ef4444",
    "#a78bfa",
    "#14b8a6",
  ];

  const datasets = numericKeys.map((k, i) => ({
    label: k,
    data: data.rows.map((r) => Number(r[k])),
    borderColor: palette[i % palette.length],
    backgroundColor: palette[i % palette.length],
    borderWidth: 2,
    pointRadius: 0,
    tension: 0.25,
  }));

  return {
    data: {
      labels,
      datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          display: true,
          position: "top",
        },
      },
      scales: {
        x: { display: true },
        y: { display: true },
      },
    },
  };
}
