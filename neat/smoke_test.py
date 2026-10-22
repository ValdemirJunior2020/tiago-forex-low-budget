#!/usr/bin/env python3
"""Proof that the genuine neat-python library trains and loads all five agents."""
import json
import math
import subprocess
import sys
import tempfile
from pathlib import Path

script=Path(__file__).with_name("neat_agents.py")
with tempfile.TemporaryDirectory() as root:
    folder=Path(root)
    bars=[]
    for i in range(180):
        value=1.1 + i*0.000002 + math.sin(i*0.25)*0.0005
        bars.append({"time":f"2026-10-{1+i//50:02d}T{i%24:02d}:{i%60:02d}:00Z",
                     "open":value, "high":value+0.0002, "low":value-0.0002,
                     "close":value+math.sin(i)*0.00004, "volume":100+i%45})
    # Synthetic data are exclusively used to smoke-test model training; they
    # are NEVER persisted as, or used to claim, real OANDA market results.
    for i,b in enumerate(bars):
        b["time"]=f"2026-10-{1+i//36:02d}T{i//2%18:02d}:{(i%2)*30:02d}:00Z"
    dataset=folder/"test-bars.json"
    dataset.write_text(json.dumps({"bars":bars}),encoding="utf-8")
    models=folder/"models"
    for mode in ("train","predict"):
        done=subprocess.run([sys.executable,str(script),mode,"--input",str(dataset),
                              "--models",str(models)],capture_output=True,text=True,timeout=160)
        if done.returncode!=0:
            raise RuntimeError(done.stderr or done.stdout)
        payload=json.loads(done.stdout)
        assert payload["source"]=="NEAT_PYTHON_LOCAL_RESEARCH"
        assert set(payload["agents"])=={"atlas","nova","pixel","sage","echo"}
        print("NEAT",mode,"PASSED: 5 independent agent networks")
