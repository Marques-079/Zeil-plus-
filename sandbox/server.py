from fastapi import FastAPI, UploadFile, Form
from fastapi.responses import JSONResponse
import subprocess, tempfile, os, sys
from pathlib import Path

app = FastAPI()

# Path setup
HERE = Path(__file__).resolve().parent
RUNNER = HERE / "cv_ranker_lite.py"
JOB = HERE / "job.txt"

@app.post("/score")
async def score_cv(file: UploadFile, keywords: str = Form("")):
    """Accept a PDF upload + keywords, run scoring, return results."""

    # Save uploaded PDF temporarily
    temp_pdf = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
    temp_pdf.write(await file.read())
    temp_pdf.flush()
    temp_pdf.close()

    try:
        # Run your existing cv_ranker_lite.py script
        result = subprocess.run(
            [sys.executable, str(RUNNER),
             "--pdf", temp_pdf.name,
             "--job", str(JOB),
             "--keywords", keywords,
             "--speed", "fast"],
            capture_output=True, text=True, check=True
        )
        # Parse script output (just take the printed lines)
        lines = result.stdout.strip().splitlines()
        data = {}
        for line in lines:
            if ":" in line:
                key, val = line.split(":", 1)
                data[key.strip()] = val.strip()

        return JSONResponse({"success": True, "data": data})

    except subprocess.CalledProcessError as e:
        return JSONResponse({"success": False, "error": e.stderr})

    finally:
        os.unlink(temp_pdf.name)
