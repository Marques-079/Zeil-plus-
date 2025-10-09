import subprocess, sys
from pathlib import Path

# caller.py lives in .../Zeil-plus-/sandbox/scorer/caller.py
HERE   = Path(__file__).resolve().parent      # .../sandbox/scorer
RUNNER = HERE / "cv_ranker.py"
PDF    = HERE / "cv_Abigail Brown.pdf"
JOB    = HERE / "job.txt"

for p in (RUNNER, PDF, JOB):
    assert p.exists(), f"Missing: {p}"

subprocess.run(
    [sys.executable, str(RUNNER),
     "--pdf", str(PDF),
     "--job", str(JOB),
     "--keywords", "POS,sales,EFTPOS,brand"],
    check=True,  # raise if cv_ranker.py fails
)
