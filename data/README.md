# Data

Source: Cricsheet IPL ball-by-ball data, JSON format (CC-BY-4.0).

1. Go to https://cricsheet.org/downloads/
2. Under "Indian Premier League", download the JSON zip.
3. Save it here as `data/ipl_male_json.zip` (do not unzip).

Our copy:
- Downloaded: 24 October 2026
- Archive built by Cricsheet: 7 October 2026 (JSON format versions 1.2.0 and 1.3.0)
- 1,243 matches, 18 April 2008 to 31 May 2026
- SHA-256: 6fe9142db9e139e4f77a5634ddc61c1c72a26a56bee2fe5affe5921867de04b3

Cricsheet updates this zip over time, so a fresh download may differ. Check the SHA-256 to
confirm you have the same file (macOS/Linux: `shasum -a 256 data/ipl_male_json.zip`).

The zip and generated files are not committed; run the scripts to recreate them.
