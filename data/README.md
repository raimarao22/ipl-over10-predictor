# Data

Source: Cricsheet IPL ball-by-ball data, JSON format (CC-BY-4.0).

1. Go to https://cricsheet.org/downloads/
2. Under "Indian Premier League", download the JSON zip.
3. Save it here as `data/ipl_male_json.zip` (do not unzip).

Our copy:
- Downloaded: 24 October 2026
- Archive built by Cricsheet: 7 October 2026 (JSON format versions 1.2.0 and 1.3.0)
- 1,243 matches, 18 April 2008 to 31 May 2026
- SHA-256: 5757e04287179767ff8495f02902bd13812b9572ec8fa2ac1347ec2e9c6d4709

Cricsheet updates this zip over time, so a fresh download may differ. An earlier build (11 June 2026)
contains the same 1,243 matches and reproduces every committed file exactly; a newer download that adds
matches will change the 2025-2026 counts. Check the SHA-256 to
confirm you have the same file (macOS/Linux: `shasum -a 256 data/ipl_male_json.zip`).

The zip and generated files are not committed; run the scripts to recreate them.
