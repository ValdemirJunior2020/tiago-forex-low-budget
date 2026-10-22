#!/usr/bin/env python3
"""Local NEAT 5-agent research. No broker credentials, no order API, no fake P/L."""
import argparse
import json
import math
import os
import pickle
import random
import sys
from pathlib import Path

IDS = ("atlas", "nova", "pixel", "sage", "echo")
FEATURES = ("momentum", "ma_gap", "channel", "volume", "candle", "volatility")
CONFIG = Path(__file__).with_name("neat-config.ini")


def load_bars(path):
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    bars = raw["bars"]
    if not isinstance(bars, list) or len(bars) < 120 or len(bars) > 2000:
        raise ValueError("Need 120..2000 completed OANDA candles")
    clean = []
    last_time = ""
    for b in bars:
        time = str(b["time"])
        o, h, l, c, v = (float(b[key]) for key in ("open", "high", "low", "close", "volume"))
        if not all(math.isfinite(n) for n in (o, h, l, c, v)) or min(o, h, l, c) <= 0 or h < l or v < 0 or time <= last_time:
            raise ValueError("Invalid/nonordered candle series")
        clean.append({"time": time, "open": o, "high": h, "low": l, "close": c, "volume": v})
        last_time = time
    return clean


def features(bars, i, agent):
    b = bars[i]
    start = bars[max(0, i - 19):i + 1]
    closes = [x["close"] for x in start]
    base = max(b["close"], 0.00001)
    ma7 = sum(closes[-7:]) / len(closes[-7:])
    ma20 = sum(closes) / len(closes)
    hi, lo = max(x["high"] for x in start), min(x["low"] for x in start)
    avg_volume = sum(x["volume"] for x in start[:-1]) / max(1, len(start) - 1)
    momentum = (b["close"] - bars[max(0, i-5)]["close"]) / base * 1000
    gap = (ma7 - ma20) / base * 1000
    channel = (2 * (b["close"] - lo) / max(hi - lo, 1e-7)) - 1
    activity = (b["volume"] / max(avg_volume, 1)) - 1
    candle = (b["close"] - b["open"]) / base * 1000
    volatility = (hi - lo) / base * 100
    values = [momentum, gap, channel, activity, candle, volatility]
    # Each agent specializes in a different feature but keeps all six inputs.
    focus = {"atlas": (0, 1), "nova": (2,), "pixel": (3, 4),
             "sage": (5, 0), "echo": (0, 2, 4)}[agent]
    return tuple(max(-3, min(3, v * (1.5 if j in focus else 0.6))) for j, v in enumerate(values))


def signal(output):
    if output > .62:
        return 1
    if output < .38:
        return -1
    return 0


def evaluate(net, bars, agent, begin, end):
    """Only predicts the NEXT completed candle; use price-only proxy, not broker P/L."""
    score, correct, wrong, acted = 0., 0, 0, 0
    for i in range(begin, end):
        decision = signal(float(net.activate(features(bars, i, agent))[0]))
        if decision == 0:
            continue
        future = (bars[i + 1]["close"] - bars[i]["close"]) / bars[i]["close"]
        # Synthetic research penalty, explicitly NOT realized OANDA profit.
        pnl_proxy = decision * future - 0.00012
        score += max(-.005, min(.005, pnl_proxy)) * 10000
        score -= .015  # mild churn penalty
        acted += 1
        if pnl_proxy > 0:
            correct += 1
        else:
            wrong += 1
    return {"fitness": round(score, 4), "correct": correct, "wrong": wrong,
            "signals": acted, "sampleCount": max(0, end-begin), "unit": "RESEARCH_SCORE_NOT_USD"}


def train(bars, dest):
    import neat
    dest.mkdir(parents=True, exist_ok=True)
    config = neat.Config(neat.DefaultGenome, neat.DefaultReproduction,
                         neat.DefaultSpeciesSet, neat.DefaultStagnation, str(CONFIG))
    split = int(len(bars) * .72)
    results = {}
    for idx, agent in enumerate(IDS):
        random.seed(20261022 + idx)
        population = neat.Population(config)

        def fitness(genomes, cfg):
            for _, genome in genomes:
                net = neat.nn.FeedForwardNetwork.create(genome, cfg)
                genome.fitness = evaluate(net, bars, agent, 25, split - 1)["fitness"]

        winner = population.run(fitness, 5)
        net = neat.nn.FeedForwardNetwork.create(winner, config)
        validation = evaluate(net, bars, agent, split, len(bars)-1)
        train_result = evaluate(net, bars, agent, 25, split-1)
        # Only ship the model as a RESEARCH object. It is not fit for automatic
        # order entry merely because a small holdout returned a positive score.
        report = {"id": agent, "status": "RESEARCH_ONLY", "train": train_result,
                  "validation": validation, "generations": 5, "populationSize": 16,
                  "lastTrainingCandle": bars[-1]["time"], "modelSource": "neat-python"}
        with (dest / (agent + ".pkl")).open("wb") as f:
            pickle.dump(winner, f, protocol=pickle.HIGHEST_PROTOCOL)
        results[agent] = report
    (dest / "reports.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
    return results


def predict(bars, dest):
    import neat
    # Pickle files must be created locally by this script; do not load untrusted files.
    config = neat.Config(neat.DefaultGenome, neat.DefaultReproduction,
                         neat.DefaultSpeciesSet, neat.DefaultStagnation, str(CONFIG))
    reports = json.loads((dest / "reports.json").read_text(encoding="utf-8"))
    result = {}
    for agent in IDS:
        with (dest / (agent + ".pkl")).open("rb") as f:
            genome = pickle.load(f)
        net = neat.nn.FeedForwardNetwork.create(genome, config)
        output = float(net.activate(features(bars, len(bars)-1, agent))[0])
        side = "BUY" if signal(output) == 1 else "SELL" if signal(output) == -1 else "WAIT"
        result[agent] = {"side": side, "confidence": round(max(output, 1-output)*100, 1),
                         "output": round(output, 5), "status": "RESEARCH_ONLY",
                         "validation": reports[agent]["validation"],
                         "lastTrainingCandle": reports[agent]["lastTrainingCandle"]}
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["train", "predict"])
    parser.add_argument("--input", required=True)
    parser.add_argument("--models", required=True)
    args = parser.parse_args()
    bars = load_bars(args.input)
    dest = Path(args.models)
    output = train(bars, dest) if args.mode == "train" else predict(bars, dest)
    print(json.dumps({"source": "NEAT_PYTHON_LOCAL_RESEARCH", "agents": output}))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"error": str(exc)[:240]}), file=sys.stderr)
        sys.exit(1)
