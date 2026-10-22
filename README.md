# Forex-Pobre | OANDA Practice Low Budget

Independent bot based on the original Tiago repository at commit afe5449. The original code, account, .env and logs were not modified.

## Rules
- OANDA Practice only. Never a LIVE endpoint and no simulated monetary results.
- Shadow 3/4: original candidate entry, break-even at +1R, and trail after +2R.
- Ollama: independent OANDA signals. Shadow and Ollama share order limits.
- OANDA officially confirms trades via Trade ID and provides balance, margin and P/L.
- Operating capital: USD 1,000. Initial stop risk: max USD 2.50/order, USD 5 combined.
- Max combined USD notional: 10,000. Max shared used margin after proposed entry: USD 200.
- Order submission is disabled by default and account identity is checked twice.

## Setup (Windows)
1. Download this separate repo and double-click START-FOREX-POBRE.bat.
2. The first launch creates .env from .env.example and stops.
3. Set OANDA_ACCOUNT_ID and LOW_BUDGET_ALLOWED_ACCOUNT_ID to the SAME new Practice account ID. Set OANDA_API_TOKEN privately. Never post this token.
4. Relaunch and verify the OANDA balance and open trades on the dashboard.
5. After account validation, set LOW_BUDGET_TRADING_ENABLED=true, OANDA_DEMO_MIRROR_ENABLED=true and OLLAMA_OANDA_PRACTICE_MIRROR_ENABLED=true in the local Low Budget .env to enable new Practice orders.

Dashboard: http://127.0.0.1:5174
Backend: http://127.0.0.1:8791
Original remains 5173/8790.

Place your local images at `client/public/logo.jpeg` and `client/public/loader.gif`. The frontend reads them directly; the GIF appears while the app checks its API, rather than pretending an order is being executed.

## Verification
Run npm install and npm run verify. GitHub Actions runs the same tests. Broker orders cannot be tested by CI without the user's private local OANDA credentials.

For November, evaluate OANDA-confirmed performance before deciding on a separately authorized and implemented LIVE project.

## OpenViking — optional local trade memory
This integration is **disabled by default** and does not change trading signals, orders or Shadow 3/4.
Once OpenViking is configured and serving on http://127.0.0.1:1933, add to this repo's private `.env`:
```ini
OPENVIKING_ENABLED=true
```
The sidecar uses localhost only and does not send API credentials.
Never commit your `.env`.

Restart only this Forex-Pobre process after checking broker positions. To verify locally,
visit http://127.0.0.1:8791/api/openviking. The status includes `reachable`, `lastSync`,
`lastError`, and the number of verified lessons sent this run.
Lessons go to account-isolated `viking://resources/forex-pobre-<account hash>/trade-<trade ID>.md`.
Only *closed, OANDA-attributed Shadow trades* are sent; no token, account number, or unverified local
paper profits are exported. The local verified OANDA study and six historical charts keep working
without OpenViking, and a disconnected OpenViking cannot prevent or trigger broker orders.

## Survival Arena — 5 independent OANDA Practice competitors (22–23 Oct 2026)

Five competitors — Atlas (trend), Nova (reversal), Pixel (activity), Sage (protection),
Echo (independent 12-candle breakout) — can **individually** request an OANDA Practice
order. Their consultation and separate memories remain on the dashboard, but no
coordinator may order on another bot's behalf. A single central guard serializes
requests and enforces the original shared constraints.

**Local opt-in**, in your **own** `.env` only:

```dotenv
LOW_BUDGET_TRADING_ENABLED=true
SURVIVAL_TRADING_ENABLED=true
OANDA_DEMO_MIRROR_ENABLED=false
OLLAMA_OANDA_PRACTICE_MIRROR_ENABLED=false
OLLAMA_NEW_ENTRIES_ENABLED=false
```

The account ID must match `LOW_BUDGET_ALLOWED_ACCOUNT_ID`, and your token remains local.
Never add the real token to Git. Start by verifying the Practice account and any
existing open positions and attached stops on OANDA. The 5 agents are disabled by
default. Changing `.env` requires restarting the local server.

- Every accepted order has unique `SV_<AGENT>_<HASH>` client ID and
  `SURVIVAL_<AGENT>` OANDA trade tag; results count **only** if the OANDA
  confirms a closed trade with that owner.
- The central `LowBudgetGuard` remains in force: <=$2.50 risk per trade,
  <=$5 shared stop exposure, <=$200 margin, <=$10,000 notional, quote/slippage
  and drawdown checks. Only one account trade at a time during an agent entry.
- Stops and take-profits are attached **on fill**. A missing response or ambiguous
  OANDA order is **not retried**. Its intent is stored in
  `data/survival-execution-state.json` and later reconciled against OANDA.
  Unresolved mismatches block further submissions; never delete this file
  while trades may still be open.
- Each bot needs >=$1 net OANDA realized P/L on **each** of October 22 and 23
  (America/New_York). At the end of a day it is eliminated if the verified
  result is below target, including zero confirmed fills. An OANDA outage
  prevents a false elimination. Winners cannot force higher risk to win.
- All new entries stop automatically at **Oct 24 00:00 EDT**.
  Open positions are not force-closed on cutoff; check broker stops on OANDA.
- The Shadow 3/4 algorithm is unchanged, as is the separate Original repository.
  The Survival bots are enabled only by the independent opt-in switches above.
- Status: `/api/survival-arena` and `/api/survival-execution`.
  Broker operations are **not** guaranteed profitable. The tests verify logic
  with mocked scenarios, not the user's live account connectivity.

## NEAT Neuroevolution — genuine local neat-python integration

The single `START-FOREX-POBRE.bat` checks for the Python launcher and
installs the published `neat-python==2.0.0` package if missing. No paid AI API
or Git checkout of NEAT is needed. The executable is `neat/neat_agents.py`
and the upstream project is
https://github.com/CodeReclaimers/neat-python (3-clause BSD license).

At startup the backend asynchronously retrieves 500 **completed** M5
EUR/USD candles from OANDA Practice, evolves **five independent** networks
(one each for Atlas, Nova, Pixel, Sage and Echo; 16-genome population,
five generations per agent), and then produces new research signals.
The first 72% of the data is used for evolution, the later 28% reserved
for chronological holdout scoring. The model is retrained no more than
once per trading day using the most recent completed-candle history.

Open `http://127.0.0.1:8791/api/neat` or the NEAT panel in the office
to check `TRAINING`, `READY` or `ERROR`, per-agent research signals and
holdout metrics. Individual model files live in `data/neat-models/` and
never belong in Git; do not import pickles from strangers. The data snapshot
used for research is kept in `data/neat-candles.json`.

**CRITICAL**: NEAT scores are a historical PRICE proxy, NOT broker profit
and not a claim of strategy edge. Evolved research signals do not place
orders, and no newly evolved model is automatically approved for live
execution. The five existing Practice execution strategies remain unchanged,
and the original Shadow 3/4 is untouched. The US$1/day financial survival
score comes exclusively from OANDA-confirmed closed trades, never NEAT
research scores.

GitHub Actions tests both TypeScript and actual Python NEAT training and
prediction (`python neat/smoke_test.py`) on generated test candles.
Those generated candles exist solely inside the smoke test and cannot
be mistaken for real OANDA data.
