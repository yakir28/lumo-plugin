---
description: Connect this computer to Lumo and install Lumo's engine
---

1. Call `lumo_doctor`. If Lumo is ready, say so in one line and stop.
2. If it isn't connected to a Lumo account: call `lumo_connect`, open the link it returns in the user's browser (`open <url>` with Bash), and tell them in one line to approve it there (the code on the page should match). Then call `lumo_connect_wait`; if it's still waiting, call it again.
3. If the subscription isn't active, tell the user they can subscribe at the link `lumo_doctor` gave, and stop.
4. If anything else is missing, tell the user in two lines what will be installed (ffmpeg if missing, Python tools, Chromium, a speech model, Lumo's sound and FX library and the Lumo app: about 3 GB, several minutes) and, once they agree, run the install command `lumo_doctor` gave you with Bash in the background. When it finishes, call `lumo_doctor` again and report the result.
