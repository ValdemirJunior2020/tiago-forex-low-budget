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

Place the provided picture at client/public/logo.png (create that folder if needed).

## Verification
Run npm install and npm run verify. GitHub Actions runs the same tests. Broker orders cannot be tested by CI without the user's private local OANDA credentials.

For November, evaluate OANDA-confirmed performance before deciding on a separately authorized and implemented LIVE project.
