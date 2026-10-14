---
description: Connect this computer to your Lumo account and install Lumo's editor
---

1. Call `lumo_doctor`. If Lumo is ready, say so in one line and tell the user they can now ask for a video in this chat (for example "edit ~/Desktop/clip.mp4 into a punchy 9:16 short").
2. If it isn't connected to a Lumo account: call `lumo_connect`, open the link it returns in the user's browser (`open <url>` with Bash), and tell them in one line to approve it there (the code on the page should match). Then call `lumo_connect_wait`; if it's still waiting, call it again.
3. If the subscription isn't active, tell the user they can subscribe at try-lumo.com, and stop.
4. If anything else is missing, tell the user in two lines what will be installed (ffmpeg if missing, Python tools, Chromium, a speech model and Lumo's sound and FX library: about 2.5 GB, a few minutes) and, once they agree, run the install command `lumo_doctor` gave you with Bash in the background. When it finishes, call `lumo_doctor` again and report the result.
