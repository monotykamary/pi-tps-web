# pi-tps-web

A static telemetry inspector for pi's tokens-per-second (TPS) exports. Drag a `.jsonl` file straight from a session — no upload, no cloud, no persistence. Everything stays in the browser.

Built for provider engineers to inspect real-world LLM behavior: how cache hit rates shift as conversations grow, where the slow zones live, and whether routing thresholds land where they should.

![preview](/tmp/pi-tps-web-v7.png)

## What it shows

- **Conversation Timeline** — TTFT, total time, and generation speed plotted over the session lifetime.
- **TTFT vs Context Size** — Scatter plot with log/linear scale toggle. Color-coded by cache efficiency: fast cache hits in moss green, slow zone (32–65k) in ember, anomalies in amber.
- **TTFT Distribution** — Histogram of where time is spent across all calls, with median and fast/slow call counts.
- **Token Composition** — Stacked bar chart of cache read / new input / output for the last 30 requests.
- **Threshold Crossings** — Compare average TTFT below and above 32k, 50k, 65k, and 80k token thresholds. Progress bars and delta badges tell the routing story.
- **Anomaly Detector** — Automatic identification of cache drops (sub-agent spawns), slow-zone requests, stall spikes, and massive new-input events.
- **Cache Efficiency** — Donut chart with overall cache hit rate, token-type breakdown, and cache-rate bars over time.
- **Request Inspector** — Full list of all calls with inline TTFT and cache-hit badges. Click to drill into one request's tokens, timing, and energy footprint.

## Energy data

Energy and cost metrics come from the `pi-neuralwatt-provider` extension. If your `.jsonl` does not include energy events, those fields display `-` instead of hiding the UI entirely.

## Usage

```bash
npm install
npm run dev       # local dev
npm run build     # static build to ./dist
```

In production, serve `./dist` from any static host. The sample data at `./public/sample.jsonl` is included for demo purposes only and is removed by the existing `.gitignore`.

## Data format

Expects the newline-delimited JSON format produced by `pi-tps`:

```jsonl
{"type":"custom","customType":"tps","data":{"model":{"provider":"...","modelId":"..."},"tokens":{"input":...,"output":...,"cacheRead":...},"timing":{"ttftMs":...,"totalMs":...},...}}
{"type":"custom","customType":"neuralwatt-energy","data":{"energy_joules":...,"cost_usd":...}}
}
```

## License

MIT
