import subprocess, sys
subprocess.run([sys.executable, "sandbox/scorer/cv_ranker.py",
                "--pdf", "sandbox/scorer/cv_Abigail_Brown.pdf",
                "--job", "sandbox/scorer/job.txt",
                "--keywords", "POS,sales,EFTPOS,brand",
                "--speed", "fast"], check=True)
