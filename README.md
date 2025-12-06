# [Client-Side Time-Series Forecast](https://github.com/europanite/client_side_time_series_forecast "Client-Side Time-Series Forecast")

[![CI](https://github.com/europanite/client_side_time_series_forecast/actions/workflows/ci.yml/badge.svg)](https://github.com/europanite/client_side_time_series_forecast/actions/workflows/ci.yml)
[![docker](https://github.com/europanite/client_side_time_series_forecast/actions/workflows/docker.yml/badge.svg)](https://github.com/europanite/client_side_time_series_forecast/actions/workflows/docker.yml)
[![pages](https://github.com/europanite/client_side_time_series_forecast/actions/workflows/pages.yml/badge.svg)](https://github.com/europanite/client_side_time_series_forecast/actions/workflows/pages.yml)

!["web_ui"](./assets/images/web_ui.png)

[PlayGround](https://europanite.github.io/client_side_time_series_forecast/)

A Client-Side Browser-Based Multivariate Time-Series Forecast Playground powered by XGBoost.

---

## Overview

This is a multivariate time series forecasting tool that runs entirely in your web browser.
No installation, registration, or payment required. 
Just access it with your browser and you're ready to go.
It helps small businesses predict tomorrow's orders.

This repository demonstrates how to:
- Load a **multivariate time series data** (CSV/XLSX) in the browser
- Visualize the series in a line chart
- Build a **rich feature matrix** on the client (lags, rolling means, interactions, time encodings)
- Train an **XGBoost regression model** in WebAssembly
- Predict the **next time step** of a chosen target series

Everything happens **inside your browser**. There is no backend API and no data leaves your machine.

---

## Demo

1. Open the GitHub Pages demo:  
   https://europanite.github.io/client_side_time_series_forecast/
2. Upload a sample file such as [`data/data.csv`](./data/data.csv) or [`data/data.xlsx`](./data/data.xlsx).
3. The app will:
   - Detect a **datetime-like column**
   - List available numeric columns
4. Choose one numeric column as the **target**.
5. Click **Train** to build the model, then click **Forecast** to predict the **next point**.
6. Inspect the chart to see the original series and the predicted future value.

---

## Data Structure

<pre>
datetime,item_a,item_b,item_c,...
2025-01-01 00:00:00+09:00,10,20,31,...
2025-01-02 00:00:00+09:00,12,19,31,...
2025-01-03 00:00:00+09:00,14,18,33,...
 ...
</pre>

### Requirements:

##### One datetime-like column
Column header contains "date" or "time" (case-insensitive).
Used as the time axis but not converted directly to numeric features.

##### One or more numeric columns
These columns are used as the target and/or exogenous features.
Currently the app focuses on univariate forecasting with exogenous variables:
You pick one numeric column as the target.
All other numeric columns are used as additional signals.

---

## Feature Engineering

This project treats the input as a small multi-variate time series:

- One *datetime-like* column (header contains `date` or `time` in any case).
- Several numeric columns (e.g., `item_a`, `item_b`, `item_c`, ...).
- One of the numeric columns is chosen as the **target** to forecast.

Internally, the feature builder constructs a **rich feature vector** for each time step `t` and a **future feature vector** for `t + 1`. All features are computed **purely on the client**, in JavaScript/TypeScript.

### Series used for features

- `datetimeKey`  
  - Detected automatically from the header that contains `"date"` or `"time"`.
  - Only used for locating the time axis; not used directly as a numeric feature.
- `targetKey`  
  - Numeric column the user chooses to forecast.
- `featureKeys`  
  - All other numeric columns (non-datetime, non-target).
  - Treated as **exogenous series**.

Internally we keep a `seriesMap: Record<string, number[]>` with one numeric array per series.

### Per-series features (exogenous series)

For every exogenous series `x(t)` (each key in `featureKeys`) and each time step `t`, we compute:

1. **Contemporaneous value**
   - `x(t)` (the value at time index `t`).

2. **Lag features (history)**
   - Up to `MAX_LAG = 3`:
     - `x(t - 1)`
     - `x(t - 2)`
     - `x(t - 3)`
   - This allows the model to learn short-term temporal dynamics per series.

3. **First difference**
   - `x(t) - x(t - 1)`
   - Captures local changes (trend / slope) rather than absolute level only.

4. **Rolling mean (local average)**
   - Rolling window of `ROLLING_WINDOW = 7` time steps:
     - `mean(x[t - 6 ... t])` (truncated near the beginning of the series)
   - Represents local trend / baseline level and smooths short-term noise.

> If the series is shorter than the window, the code automatically shrinks the window so that all available past points up to `t` are used.

### Target-series history

For the **target series** `y(t)` itself, we do **not** include the current value `y(t)` as a feature (because it is the label at that step), but we do include its history:

1. **Target lags**
   - `y(t - 1)`
   - `y(t - 2)`
   - `y(t - 3)`

2. **Target difference**
   - `y(t) - y(t - 1)`

3. **Target rolling mean**
   - Same rolling window as above:
     - `mean(y[t - 6 ... t])`

This lets the model learn patterns like “the next value depends on the last few values and their local trend,” which is typical in time-series forecasting.

### Cross-series interactions

To capture **relationships between different series**, we build interaction features for every **pair of numeric series** (including the target):

- Let `v_i(t)` and `v_j(t)` be the contemporaneous values of two series at time `t`.
- For each ordered pair `(i, j)` with `i < j`, we compute:

1. **Spread**
   - `v_i(t) - v_j(t)`
   - Encodes relative level differences between series.

2. **Ratio**
   - `v_i(t) / v_j(t)`
   - To avoid division by zero, the denominator includes a small epsilon if needed:
     - `denom = |v_j| < 1e-9 ? sign(v_j) * 1e-9 : v_j`
   - Encodes relative scale and proportionality.

3. **Product**
   - `v_i(t) * v_j(t)`
   - Allows the model to express “interaction effects” where both series being large or small matters.

These cross-series features explicitly expose **multi-series structure** to the booster instead of relying only on individual series values.

### Time index and Fourier features

We also encode time itself as numeric features:

1. **Time index**
   - Integer index `t = 0, 1, 2, ...` (row index).
   - Gives the booster a simple way to model global trends.

2. **Fourier features** (cyclical patterns)
   - Two fixed periods (in units of “number of rows”):
     - Period 24 (e.g., 24 hours in hourly data)
     - Period 168 (e.g., 7 days × 24 hours)
   - For each period `P` we compute:
     - `sin(2πt / P)`
     - `cos(2πt / P)`
   - This is a standard way to embed seasonality/cycles in a form that tree models can still exploit.

The final feature vector for each time step `t` is:

```text
[ exogenous features (current, lags, diff, rolling mean for each series),
  target-series history (lags, diff, rolling mean),
  cross-series interactions (spread, ratio, product),
  time index, sin/cos(2πt/24), sin/cos(2πt/168) ]
```

### Future-step feature vector (lastFeatureRow)
The same feature-building logic is used to produce a feature vector for t + 1 (one-step-ahead prediction):
- Conceptually, we treat the next time index as t_next = n where n is the number of observed rows.
- For the “current” values of each series at t_next, we reuse the last observed value (index n - 1).
- Lags and rolling means are computed using the last MAX_LAG / ROLLING_WINDOW steps in the observed data.
- Time encodings use t_next as the time index.
- This gives a single feature vector lastFeatureRow that represents the next time step based on all history up to the last observation.

The buildFeatures function therefore returns:
```text
{
  X: number[][];        // feature matrix for all observed steps
  y: number[];          // target series values for those steps
  lastFeatureRow: number[]; // feature vector representing t + 1
}
```

## 🚀 Getting Started

### 1. Prerequisites
- [Docker Compose](https://docs.docker.com/compose/)

### 2. Build and start all services:

```bash

# Build the image
docker compose build

# Run the container
docker compose up

```

### 3. Test:
```bash
docker compose \
-f docker-compose.test.yml up \
--build --exit-code-from \
frontend_test
```

---

# License
- Apache License 2.0