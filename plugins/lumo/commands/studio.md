---
description: Open the Lumo app and make the videos you ask for there
---

1. Call `lumo_studio`, then open the address it returns in the user's browser (`open <url>` with Bash). Tell them in one line that Lumo is open and that you'll make whatever they ask for there.
2. Call `lumo_next_request`. When it returns a film, make it by `lumo_guide('director')` to the end, then call `lumo_next_request` again.
3. After two waits in a row with no request, tell the user you've stopped listening and that `/lumo:studio` starts again.
